//! Identités publiques des champs ; les paramètres Typst et archives restent inchangés.
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum MetadataField {
    #[serde(rename = "article.references")]
    ArticleReferences,
    #[serde(rename = "article.reference_sources")]
    ArticleReferenceSources,
    #[serde(rename = "article.citation_style")]
    ArticleCitationStyle,
    #[serde(rename = "article.show_outline")]
    ArticleOutline,
    #[serde(rename = "article.authors")]
    ArticleAuthors,
    #[serde(rename = "article.affiliations")]
    ArticleAffiliations,
    #[serde(rename = "article.localizations")]
    ArticleLocalizations,
    #[serde(rename = "article.publication.doi")]
    PublicationDoi,
    #[serde(rename = "article.publication.venue")]
    PublicationVenue,
    #[serde(rename = "article.publication.kind")]
    PublicationKind,
    #[serde(rename = "article.publication.access")]
    PublicationAccess,
    #[serde(rename = "article.publication.submitted")]
    PublicationSubmitted,
    #[serde(rename = "article.publication.accepted")]
    PublicationAccepted,
    #[serde(rename = "article.publication.published")]
    PublicationPublished,
    #[serde(rename = "article.publication.short_citation")]
    PublicationShortCitation,
    #[serde(rename = "article.publication.first_page")]
    PublicationFirstPage,
    #[serde(rename = "sender.signature")]
    SenderSignature,
    #[serde(rename = "sender.name")]
    SenderName,
    #[serde(rename = "sender.role")]
    SenderRole,
    #[serde(rename = "sender.department")]
    SenderDepartment,
    #[serde(rename = "sender.email")]
    SenderEmail,
    #[serde(rename = "sender.organisation")]
    SenderOrganisation,
    #[serde(rename = "sender.address")]
    SenderAddress,
    #[serde(rename = "sender.phone")]
    SenderPhone,
    #[serde(rename = "recipient.name")]
    RecipientName,
    #[serde(rename = "recipient.address")]
    RecipientAddress,
    #[serde(rename = "letter.subject")]
    LetterSubject,
    #[serde(rename = "letter.reference")]
    LetterReference,
    #[serde(rename = "letter.place")]
    LetterPlace,
    #[serde(rename = "letter.date")]
    LetterDate,
    #[serde(rename = "meeting.title")]
    MeetingTitle,
    #[serde(rename = "meeting.date")]
    MeetingDate,
    #[serde(rename = "meeting.place")]
    MeetingPlace,
    #[serde(rename = "meeting.author")]
    MeetingAuthor,
    #[serde(rename = "meeting.attendees")]
    MeetingAttendees,
    #[serde(rename = "meeting.apologies")]
    MeetingApologies,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct FieldValue {
    pub field: MetadataField,
    pub value: serde_json::Value,
    pub presentation: Option<super::model_options::OptionId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<crate::resources::ResourceDescriptor>,
    pub parameter: &'static str,
    pub group: &'static str,
    pub multiline: bool,
    pub kind: super::FieldKind,
    pub required_for_export: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<FieldChoice>,
    #[serde(skip)]
    pub label_key: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct FieldChoice {
    pub value: String,
    pub label_key: String,
}
