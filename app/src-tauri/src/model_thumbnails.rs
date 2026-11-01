//! On-demand first-page thumbnails of bundled models, independent of the open document.
use crate::error::CommandError;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};
use typstographe_core::{
    document_types::{DocumentType, Metadata, models},
    rendering::TypstWorld,
};

// The catalogue is immutable for this application build. Never cache personal data.
static THUMBNAILS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn sample(kind: DocumentType) -> &'static str {
    match kind {
        DocumentType::Courrier => {
            "Madame, Monsieur,\n\nJe vous adresse cette demande afin de préparer notre prochaine rencontre. Elle permettra de faire le point sur les actions menées et de convenir ensemble des prochaines étapes.\n\nPourriez-vous me confirmer votre disponibilité et me transmettre les éléments utiles à la préparation de cette réunion ?\n\nJe vous remercie pour votre retour et vous prie d’agréer, Madame, Monsieur, mes salutations distinguées."
        }
        DocumentType::Article => {
            "= Introduction\n\nL’organisation du travail universitaire connaît des transformations qui invitent à examiner les pratiques et les conditions de leur évolution. Cet article propose une analyse de ces changements à partir d’une enquête de terrain.\n\n= Méthode\n\nL’étude associe des entretiens et l’observation des activités quotidiennes. Cette démarche permet de confronter les expériences individuelles aux dynamiques collectives.\n\n= Résultats\n\nLes résultats mettent en évidence la diversité des pratiques et l’importance des échanges entre collègues. Ils ouvrent des perspectives pour de nouvelles recherches.\n\n= Conclusion\n\nCette analyse souligne le rôle des collectifs dans l’évolution du travail universitaire."
        }
        DocumentType::CompteRendu => {
            "= Échanges\n\nLes participants présentent les travaux en cours.\n\n= Décisions\n\nUne nouvelle rencontre permettra de suivre les actions engagées."
        }
    }
}

/// Runs on a Tauri worker; no session, shared preview renderer or disk access.
#[tauri::command(async)]
pub fn model_thumbnail(model_id: String) -> Result<String, CommandError> {
    let model = models::ALL
        .iter()
        .find(|entry| entry.model.id() == model_id)
        .ok_or_else(|| CommandError::from("unknown_model"))?;
    let mut cache = THUMBNAILS.get_or_init(Mutex::default).lock()?;
    if let Some(image) = cache.get(&model_id) {
        return Ok(image.clone());
    }
    let mut world = TypstWorld::default();
    world.set_dependencies(&typstographe_core::packages::for_template(model.source));
    let document = world
        .compile_with_template(
            sample(model.kind),
            &Metadata::demo(model.kind),
            model.source,
        )
        .map_err(CommandError::message)?;
    let page = document.pages().first().ok_or("empty_model_preview")?;
    // About 320 pixels across for A4, enough for a sharp small thumbnail at 2x.
    let raster = typst_render::render(
        page,
        &typst_render::RenderOptions {
            pixel_per_pt: (320.0 / page.frame.size().x.to_pt()).into(),
            ..Default::default()
        },
    );
    let image = format!(
        "data:image/png;base64,{}",
        STANDARD.encode(raster.encode_png()?)
    );
    cache.insert(model_id, image.clone());
    Ok(image)
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;

    #[test]
    fn every_registered_model_has_a_real_small_cached_thumbnail() {
        for model in models::ALL {
            let thumbnail = model_thumbnail(model.model.id().into()).unwrap();
            let bytes = STANDARD
                .decode(thumbnail.strip_prefix("data:image/png;base64,").unwrap())
                .unwrap();
            let reader = png::Decoder::new(std::io::Cursor::new(bytes))
                .read_info()
                .unwrap();
            assert_eq!(reader.info().width, 320);
            assert!(reader.info().height > 300);
            assert!(reader.info().height < 600);
            assert_eq!(thumbnail, model_thumbnail(model.model.id().into()).unwrap());
        }
        assert!(model_thumbnail("absent".into()).is_err());
    }
}
