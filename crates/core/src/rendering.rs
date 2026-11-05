//! Moteur Typst embarqué : fichiers virtuels et polices embarquées, sans réseau.
mod visual;
use crate::document_types::{Metadata, model_options};
use crate::errors::{CoreError, TemplateError};
use comemo::Track;
use std::collections::HashMap;
use typst::{
    Feature, Library, LibraryExt, World, WorldExt,
    diag::{FileError, FileResult},
    engine::{Route, Sink, Traced},
    foundations::{Bytes, Datetime, Duration, Module, Value},
    syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot},
    text::{Font, FontBook},
    utils::LazyHash,
};
use typst_layout::PagedDocument;
pub use visual::page_key;

#[derive(Clone)]
pub struct TypstWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    files: HashMap<FileId, Source>,
    assets: HashMap<FileId, Bytes>,
    dependencies: HashMap<FileId, Bytes>,
    main: FileId,
}

impl Default for TypstWorld {
    fn default() -> Self {
        let fonts = crate::fonts::typst_fonts();
        let book = FontBook::from_fonts(fonts.iter());
        let main = file_id("main.typ");
        Self {
            library: LazyHash::new(
                Library::builder()
                    .with_features([Feature::A11yExtras].into_iter().collect())
                    .build(),
            ),
            book: LazyHash::new(book),
            fonts,
            files: HashMap::new(),
            assets: HashMap::new(),
            dependencies: crate::packages::bundled()
                .iter()
                .map(|(path, data)| (file_id(path), Bytes::new(data.clone())))
                .collect(),
            main,
        }
    }
}
pub(crate) fn file_id(path: &str) -> FileId {
    FileId::new(RootedPath::new(
        VirtualRoot::Project,
        VirtualPath::new(path).expect("chemin embarqué valide"),
    ))
}

impl TypstWorld {
    /// Remplacement intégral : le rendu d’un fichier ne complète jamais ses ressources
    /// avec celles de l’application ou du cache Typst de la machine.
    pub fn set_dependencies(&mut self, files: &crate::packages::Dependencies) {
        self.dependencies = files
            .iter()
            .map(|(path, data)| (file_id(path), Bytes::new(data.clone())))
            .collect();
    }

    pub fn set_assets(&mut self, assets: &crate::assets::Assets) {
        self.assets = assets
            .iter()
            .map(|(path, data)| (file_id(path), Bytes::new(data.clone())))
            .collect();
    }
    fn set_source(&mut self, name: &str, text: &str) {
        let id = file_id(name);
        self.files
            .entry(id)
            .and_modify(|source| {
                if source.text() != text {
                    source.replace(text);
                }
            })
            .or_insert_with(|| Source::new(id, text.to_owned()));
    }
    fn model_module(&mut self, template: &str) -> Result<Module, CoreError> {
        self.set_source("modele.typ", template);
        let source = self
            .source(file_id("modele.typ"))
            .map_err(CoreError::external)?;
        typst_eval::eval(
            (self as &dyn World).track(),
            &self.library,
            Traced::default().track(),
            Sink::new().track_mut(),
            Route::default().track(),
            &source,
        )
        .map_err(|errors| {
            errors
                .iter()
                .map(|e| e.message.to_string())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .map_err(|error| CoreError::from(TemplateError::Compilation { error }))
    }
    pub fn validate_with_model(
        &mut self,
        source: &str,
        metadata: &Metadata,
        template: &str,
        manifest: &str,
    ) -> Result<model_options::Manifest, CoreError> {
        let module = self.model_module(template)?;
        let function = metadata.document_type().composition_function();
        if !module
            .scope()
            .get(function)
            .is_some_and(|binding| matches!(binding.read(), Value::Func(_)))
        {
            return Err(CoreError::from(TemplateError::ContractMissing {
                function: function.into(),
            }));
        }
        self.compile_with_model(source, metadata, template, manifest)?;
        model_options::load(manifest).map_err(CoreError::external)
    }
    #[cfg(test)]
    pub fn validate_model(
        &mut self,
        source: &str,
        metadata: &Metadata,
        template: &str,
    ) -> Result<model_options::Manifest, CoreError> {
        self.validate_with_model(
            source,
            metadata,
            template,
            metadata.document_type().default_model_manifest(),
        )
    }
    #[cfg(test)]
    pub fn compile_with_template(
        &mut self,
        source: &str,
        metadata: &Metadata,
        template: &str,
    ) -> Result<PagedDocument, CoreError> {
        self.compile_with_model(
            source,
            metadata,
            template,
            metadata.document_type().default_model_manifest(),
        )
    }
    #[cfg(test)]
    #[cfg_attr(coverage_nightly, coverage(off))]
    pub fn compile_courrier(
        &mut self,
        source: &str,
        metadata: &Metadata,
        model: crate::document_types::models::Model,
    ) -> Result<PagedDocument, CoreError> {
        self.compile_with_template(source, metadata, &model.source())
    }
    pub fn compile_with_model(
        &mut self,
        source: &str,
        metadata: &Metadata,
        template: &str,
        manifest: &str,
    ) -> Result<PagedDocument, CoreError> {
        metadata.validate().map_err(CoreError::external)?;
        let resolved = model_options::load(manifest)
            .and_then(|m| m.resolve(metadata))
            .map_err(CoreError::external)?;
        let metadata = &resolved.metadata;
        self.files
            .retain(|id, _| !id.vpath().get_with_slash().starts_with("/bibliography/"));
        for (path, data) in crate::bibliography::resources(metadata) {
            self.set_source(
                &path,
                std::str::from_utf8(&data).map_err(CoreError::external)?,
            );
        }
        self.set_source("main.typ", &resolved.main_source());
        self.set_source("modele.typ", template);
        self.set_source("contenu.typ", source);
        let result = typst::compile::<PagedDocument>(self);
        result
            .output
            .map_err(|errors| {
                errors
                    .iter()
                    .map(|error| {
                        let location = error
                            .span
                            .id()
                            .and_then(|id| self.files.get(&id).map(|s| (id, s)))
                            .and_then(|(id, s)| {
                                self.range(error.span).map(|range| {
                                    format!(
                                        "{}:{}",
                                        id.vpath().get_with_slash(),
                                        s.lines().byte_to_line(range.start).unwrap_or(0) + 1
                                    )
                                })
                            })
                            .unwrap_or_else(|| "Typst".into());
                        let hints = error
                            .hints
                            .iter()
                            .map(|hint| format!("\n  {}", hint.v))
                            .collect::<String>();
                        format!("{location} : {}{hints}", error.message)
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .map_err(|error| CoreError::from(TemplateError::Compilation { error }))
    }
}

impl World for TypstWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }
    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }
    fn main(&self) -> FileId {
        self.main
    }
    fn source(&self, id: FileId) -> FileResult<Source> {
        if let Some(source) = self.files.get(&id) {
            return Ok(source.clone());
        }
        let bytes = self
            .dependencies
            .get(&id)
            .ok_or_else(|| FileError::NotFound(id.vpath().get_with_slash().into()))?;
        let text = std::str::from_utf8(bytes).map_err(|_| FileError::InvalidUtf8)?;
        Ok(Source::new(id, text.to_owned()))
    }
    fn file(&self, id: FileId) -> FileResult<Bytes> {
        self.assets
            .get(&id)
            .or_else(|| self.dependencies.get(&id))
            .cloned()
            .map(Ok)
            .unwrap_or_else(|| {
                self.source(id)
                    .map(|s| Bytes::new(s.text().as_bytes().to_vec()))
            })
    }
    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }
    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

impl typst_ide::IdeWorld for TypstWorld {
    fn upcast(&self) -> &dyn World {
        self
    }
}

#[derive(Clone)]
pub struct RenderRequest {
    pub source: String,
    pub assets: crate::assets::Assets,
    pub dependencies: crate::packages::Dependencies,

    pub metadata: Metadata,
    pub template: String,
    pub model_manifest: String,
}

/// Même rasterisation pour une page demandée par un adaptateur et les PNG d’export.
pub(crate) fn page_png(
    document: &PagedDocument,
    index: usize,
) -> Result<Option<Vec<u8>>, CoreError> {
    document
        .pages()
        .get(index)
        .map(|page| {
            typst_render::render(page, &typst_render::RenderOptions::default())
                .encode_png()
                .map_err(CoreError::external)
        })
        .transpose()
}

/// Même rétention pour un adaptateur qui possède déjà les chemins de ses objets.
#[allow(clippy::too_many_arguments)]
pub fn retained_assets_for_paths(
    source: &str,
    metadata: &Metadata,
    template: &str,
    assets: &crate::assets::Assets,
    dependencies: &crate::packages::Dependencies,
    mut required: std::collections::BTreeSet<String>,
    manifest: &str,
) -> Result<crate::assets::Assets, CoreError> {
    if assets.is_empty() {
        return Ok(assets.clone());
    }
    required.extend(metadata.resource_paths());
    fn declared_paths(
        node: &typst_syntax::SyntaxNode,
        required: &mut std::collections::BTreeSet<String>,
    ) {
        use typst_syntax::ast;
        if let Some(value) = node.cast::<ast::Str>() {
            let value = value.get();
            let path = value.trim_start_matches('/').trim_start_matches("./");
            if crate::assets::valid_path(path) {
                required.insert(path.into());
            }
        }
        for child in node.children() {
            declared_paths(child, required);
        }
    }
    declared_paths(
        typst_syntax::Source::detached(template).root(),
        &mut required,
    );
    let candidates: Vec<_> = assets
        .keys()
        .filter(|path| !required.contains(*path))
        .cloned()
        .collect();
    if candidates.is_empty() {
        return Ok(assets.clone());
    }
    let mut world = TypstWorld::default();
    world.set_assets(assets);
    world.set_dependencies(dependencies);
    let Ok(baseline) = world.compile_with_model(source, metadata, template, manifest) else {
        // L’enregistrement doit rester possible pendant une erreur de modèle.
        // Sans résultat de référence, conserver les ressources est le seul choix sûr.
        return Ok(assets.clone());
    };
    let expected = typst::utils::hash128(&baseline);
    let mut retained = assets.clone();
    // Essayer d’abord tout le lot : une seule vérification suffit pour les anciennes
    // images d’un courrier courant. Subdiviser seulement si le modèle en utilise.
    fn prune(
        paths: &[String],
        assets: &mut crate::assets::Assets,
        unchanged: &mut impl FnMut(&crate::assets::Assets) -> bool,
    ) {
        if paths.is_empty() {
            return;
        }
        let removed: crate::assets::Assets = paths
            .iter()
            .filter_map(|path| assets.remove(path).map(|data| (path.clone(), data)))
            .collect();
        if unchanged(assets) {
            return;
        }
        assets.extend(removed);
        if paths.len() > 1 {
            let middle = paths.len() / 2;
            prune(&paths[..middle], assets, unchanged);
            prune(&paths[middle..], assets, unchanged);
        }
    }
    prune(&candidates, &mut retained, &mut |trial| {
        world.set_assets(trial);
        world
            .compile_with_model(source, metadata, template, manifest)
            .is_ok_and(|output| typst::utils::hash128(&output) == expected)
    });
    Ok(retained)
}

/// Même compilation Typst pour le worker natif et la requête sans UI. La
/// rasterisation et les écritures éventuelles appartiennent à leurs adaptateurs.
#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod asset_tests {
    use super::*;
    use crate::{assets::Assets, document_types::DocumentType};

    #[test]
    fn pruning_preserves_model_dependencies_computed_paths_and_shared_images() {
        let metadata = Metadata::demo(DocumentType::Courrier);
        let template = DocumentType::Courrier.default_model().replace(
            "  body\n",
            "  image(\"images/\" + \"shared\" + \".svg\", width: 12pt)\n  body\n",
        ) + "\n// Ancienne image : \"images/obsolete.svg\"\n#let future-logo = \"images/future.svg\"\n";
        assert!(
            template.contains("image(\"images/\" + \"shared\""),
            "injection de l’image dans le modèle"
        );
        // Des octets identiques ne signifient pas que les chemins sont interchangeables.
        let bytes: std::sync::Arc<[u8]> = include_bytes!("../../../fixtures/parc.svg")
            .as_slice()
            .into();
        let assets: Assets = ["shared", "future", "obsolete", "deleted"]
            .into_iter()
            .map(|name| (format!("images/{name}.svg"), bytes.clone()))
            .collect();
        let source = "#figure(image(\"images/shared.svg\"), caption: [Un parc.])";
        let expected: Vec<String> = vec!["images/future.svg".into(), "images/shared.svg".into()];
        for body in [source, "Texte sans image.", source, ""] {
            let retained = retained_assets_for_paths(
                body,
                &metadata,
                &template,
                &assets,
                &crate::packages::for_template(&template),
                Default::default(),
                DocumentType::Courrier.default_model_manifest(),
            )
            .unwrap();
            assert_eq!(retained.keys().cloned().collect::<Vec<_>>(), expected);
            let mut world = TypstWorld::default();
            world.set_assets(&retained);
            world
                .compile_with_template(body, &metadata, &template)
                .unwrap();
        }
        assert_eq!(assets.len(), 4);
    }

    #[test]
    fn a_broken_model_does_not_lose_resources_during_save() {
        let mut assets = Assets::new();
        assets.insert(
            "images/logo.svg".into(),
            include_bytes!("../../../fixtures/parc.svg")
                .as_slice()
                .into(),
        );
        assert_eq!(
            retained_assets_for_paths(
                "",
                &Metadata::demo(DocumentType::Courrier),
                "#let courrier(..args) = panic(\"modèle à réparer\")",
                &assets,
                &Default::default(),
                Default::default(),
                DocumentType::Courrier.default_model_manifest(),
            )
            .unwrap(),
            assets
        );
    }
}
