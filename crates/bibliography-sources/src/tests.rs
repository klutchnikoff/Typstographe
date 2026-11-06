use super::*;
use serde_json::json;
const CROSSREF: &str =
    include_str!("../../../fixtures/bibliography/online/crossref-cairn-chapter.json");
const CAIRN: &str = include_str!("../../../fixtures/bibliography/online/cairn-chapter.xml");
const ZBMATH: &str = include_str!("../../../fixtures/bibliography/online/zbmath-wiles.json");

#[test]
fn doi_and_cairn_inputs_are_precise_and_never_arbitrary_fetch_urls() {
    let expected = "DBU_JORRO_2022_01_0155";
    for q in [
        "10.3917/dbu.jorro.2022.01.0155",
        "https://doi.org/10.3917/dbu.jorro.2022.01.0155",
        "oai:cairn.info:DBU_JORRO_2022_01_0155",
        "https://shs.cairn.info/article/DBU_JORRO_2022_01_0155",
        "https://oai.cairn.info/oai.php?identifier=DBU_JORRO_2022_01_0155",
    ] {
        assert_eq!(cairn_identifier(q).as_deref(), Some(expected));
    }
    for q in [
        "https://cairn.info.evil.invalid/article/DBU_TEST",
        "https://localhost/article/DBU_TEST",
        "https://user@shs.cairn.info/article/DBU_TEST",
        "https://shs.cairn.info:444/article/DBU_TEST",
        "../../test",
        "10.3917/",
        "10.xxx/no",
        "10.3917/x y",
    ] {
        assert!(cairn_identifier(q).is_none(), "{q}");
    }
}
#[test]
fn crossref_chapter_retains_the_deposit_and_warns_about_the_wrong_title() {
    let r = crossref::parse(CROSSREF).unwrap().remove(0);
    assert_eq!(r.provider, Provider::Crossref);
    assert_eq!(
        r.title,
        "Dictionnaire des concepts de la professionnalisation"
    );
    assert!(r.authors.contains("Eneau"));
    assert!(r.warnings.contains(&Warning::ChapterTitleMatchesBook));
    assert_eq!(r.entry["type"], "chapter");
    let library = typstographe_bibliography::parse_native(
        &r.contents,
        typstographe_bibliography::ImportFormat::Hayagriva,
    )
    .unwrap();
    let record = library.iter().next().unwrap();
    assert_eq!(record.key(), "eneau_dictionnaire_2022");
    assert!(r.contents.contains("155"));
}
#[test]
fn cairn_recovers_the_chapter_title_without_scraping_a_protected_page() {
    let r = cairn::parse(CAIRN, "DBU_JORRO_2022_01_0155")
        .unwrap()
        .unwrap();
    assert_eq!(r.entry["title"], "Émancipation");
    assert_eq!(r.entry["author"][0]["given-name"], "Jérôme");
    assert_eq!(r.entry["page-range"], "155-159");
    assert_eq!(r.parent_doi.as_deref(), Some("10.3917/dbu.jorro.2022.01"));
    assert!(cairn::parse(CAIRN, "WRONG_ID").is_err());
    assert!(
        cairn::parse(
            "<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///etc/passwd'>]><x>&y;</x>",
            "X_Y"
        )
        .is_err()
    );
}
#[test]
fn crossref_missing_dates_are_not_invented_from_deposit_or_creation_dates() {
    let data = json!({"type":"book", "title":["Undated"], "created":{"date-parts":[[2026]]}});
    let (r, _) = crossref::entry(&data);
    assert!(r.get("date").is_none());
}
#[test]
fn zbmath_has_native_people_and_container_and_keeps_its_own_result() {
    let r = zbmath::parse(ZBMATH).unwrap().remove(0);
    assert_eq!(r.doi.as_deref(), Some("10.2307/2118559"));
    assert_eq!(r.entry["type"], "article");
    assert!(r.title.contains("Fermat"));
    assert_eq!(r.year, Some(1995));
    assert_eq!(r.entry["parent"][0]["type"], "periodical");
}
#[test]
fn crossref_and_zbmath_reject_structurally_invalid_payloads() {
    for body in ["<html>unavailable</html>", "null", "{}"] {
        assert!(crossref::parse(body).is_err());
        assert!(zbmath::parse(body).is_err());
    }
}
#[test]
fn modern_cairn_page_url_resolves_only_the_exact_isbn_resource_and_page() {
    let body = include_str!("../../../fixtures/bibliography/online/crossref-cairn-isbn.json");
    let url = "https://shs.cairn.info/dictionnaire-des-concepts-de-la-professionnalisation--9782807340534-page-155?lang=fr";
    assert_eq!(
        input::cairn_page(url),
        Some(("9782807340534".into(), "155".into()))
    );
    assert_eq!(
        client::resolve_page(body, url, "155").unwrap(),
        "DBU_JORRO_2022_01_0155"
    );
    assert!(client::resolve_page(body, url, "156").is_err());
}

async fn server(
    response: impl Fn(&str) -> (u16, String) + Send + Sync + 'static,
) -> (String, tokio::task::JoinHandle<()>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let response = std::sync::Arc::new(response);
    let handle = tokio::spawn(async move {
        loop {
            let (mut socket, _) = listener.accept().await.unwrap();
            let response = response.clone();
            tokio::spawn(async move {
                let mut request = vec![0; 8192];
                let n = socket.read(&mut request).await.unwrap();
                let (status, body) = response(std::str::from_utf8(&request[..n]).unwrap());
                let headers = format!(
                    "HTTP/1.1 {status} Response\r\nContent-Length: {}\r\nRetry-After: 7\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = socket.write_all(headers.as_bytes()).await;
                let _ = socket.write_all(body.as_bytes()).await;
            });
        }
    });
    (url, handle)
}
fn request(query: &str, sources: Vec<Provider>) -> Search {
    Search {
        query: query.into(),
        sources,
        limit: 8,
    }
}
#[tokio::test]
async fn independent_failure_does_not_hide_a_working_provider() {
    let (url, task) = server(|s| {
        if s.contains("/zbmath?") {
            (200, ZBMATH.into())
        } else {
            (503, "down".into())
        }
    })
    .await;
    let client = Client::testing(&url);
    let result = client
        .search(request(
            "Fermat",
            vec![Provider::Crossref, Provider::Zbmath],
        ))
        .await;
    assert_eq!(result.candidates.len(), 1);
    assert_eq!(result.issues[0].provider, Provider::Crossref);
    assert_eq!(result.issues[0].code, ErrorCode::Unavailable);
    task.abort();
}
#[tokio::test]
async fn not_found_rate_limits_invalid_json_and_large_bodies_have_distinct_results() {
    for (status, body, code) in [
        (404, String::new(), None),
        (429, String::new(), Some(ErrorCode::RateLimited)),
        (200, "invalid".into(), Some(ErrorCode::InvalidResponse)),
        (
            200,
            "x".repeat(2 * 1024 * 1024 + 1),
            Some(ErrorCode::TooLarge),
        ),
    ] {
        let (url, task) = server(move |_| (status, body.clone())).await;
        let r = Client::testing(&url)
            .search(request("title", vec![Provider::Crossref]))
            .await;
        assert!(r.candidates.is_empty());
        assert_eq!(r.issues.first().map(|e| e.code), code);
        if status == 429 {
            assert_eq!(r.issues[0].retry_after, Some(7));
        }
        task.abort();
    }
}
#[tokio::test]
async fn cairn_and_crossref_stay_separate_candidates_and_cairn_overrides_only_its_own_fields() {
    let (url, task) = server(|s| {
        if s.contains("/cairn?") {
            (200, CAIRN.into())
        } else {
            (200, CROSSREF.into())
        }
    })
    .await;
    let result = Client::testing(&url)
        .search(request(
            "10.3917/dbu.jorro.2022.01.0155",
            vec![Provider::Crossref, Provider::Cairn],
        ))
        .await;
    assert!(result.issues.is_empty(), "{:?}", result.issues);
    assert_eq!(result.candidates.len(), 2);
    assert_ne!(result.candidates[0].id, result.candidates[1].id);
    assert_eq!(result.candidates[1].title, "Émancipation");
    assert_eq!(
        result.candidates[1].entry["parent"][0]["title"],
        "Dictionnaire des concepts de la professionnalisation"
    );
    assert!(
        !result.candidates[1]
            .warnings
            .contains(&Warning::ChapterTitleMatchesBook)
    );
    task.abort();
}
#[tokio::test]
async fn query_bounds_and_cairn_free_text_never_trigger_a_request() {
    let (url, task) = server(|_| panic!("invalid queries cannot reach transport")).await;
    let client = Client::testing(&url);
    for q in ["", "\n", &"x".repeat(513)] {
        assert_eq!(
            client
                .search(request(q, vec![Provider::Crossref]))
                .await
                .issues[0]
                .code,
            ErrorCode::InvalidQuery
        );
    }
    assert_eq!(
        client
            .search(request("an author", vec![Provider::Cairn]))
            .await
            .issues[0]
            .code,
        ErrorCode::UnsupportedQuery
    );
    task.abort();
}

#[tokio::test]
async fn cairn_metadata_remains_reviewable_when_crossref_is_unavailable() {
    let (url, task) = server(|s| {
        if s.contains("/cairn?") {
            (200, CAIRN.into())
        } else {
            (503, String::new())
        }
    })
    .await;
    let result = Client::testing(&url)
        .search(request(
            "10.3917/dbu.jorro.2022.01.0155",
            vec![Provider::Cairn],
        ))
        .await;
    assert!(result.issues.is_empty());
    assert_eq!(result.candidates.len(), 1);
    assert_eq!(result.candidates[0].title, "Émancipation");
    assert!(
        result.candidates[0]
            .warnings
            .contains(&Warning::ParentUnavailable)
    );
    task.abort();
}
#[tokio::test]
async fn exact_doi_lookup_rejects_a_different_work() {
    let (url, task) = server(|_| (200, CROSSREF.into())).await;
    let result = Client::testing(&url)
        .search(request("10.1000/wrong-work", vec![Provider::Crossref]))
        .await;
    assert!(result.candidates.is_empty());
    assert_eq!(result.issues[0].code, ErrorCode::InvalidResponse);
    task.abort();
}
#[tokio::test]
async fn modern_cairn_url_uses_the_exact_catalogue_match_before_oai() {
    let (url, task) = server(|s| {
        if s.contains("/cairn?") {
            (200, CAIRN.into())
        } else if s.contains("filter=") {
            (
                200,
                include_str!("../../../fixtures/bibliography/online/crossref-cairn-isbn.json")
                    .into(),
            )
        } else {
            (200, CROSSREF.into())
        }
    })
    .await;
    let result = Client::testing(&url).search(request(
        "https://shs.cairn.info/dictionnaire-des-concepts-de-la-professionnalisation--9782807340534-page-155?lang=fr",
        vec![Provider::Cairn],
    )).await;
    assert!(result.issues.is_empty(), "{:?}", result.issues);
    assert_eq!(result.candidates[0].title, "Émancipation");
    task.abort();
}
#[tokio::test]
async fn a_stalled_response_times_out_without_mutating_any_document() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let (_socket, _) = listener.accept().await.unwrap();
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
    });
    let result = Client::testing(&url)
        .search(request("title", vec![Provider::Crossref]))
        .await;
    assert!(result.candidates.is_empty());
    assert_eq!(result.issues[0].code, ErrorCode::Timeout);
    task.abort();
}
