use super::*;
use serde_json::json;
const CHAPTER: &str = include_str!("../../../fixtures/bibliography/online/doi-cairn-chapter.json");
const BOOK: &str = include_str!("../../../fixtures/bibliography/online/doi-cairn-book.json");
const REPORT: &str = include_str!("../../../fixtures/bibliography/online/doi-datacite-report.json");
const CAIRN: &str = include_str!("../../../fixtures/bibliography/online/cairn-chapter.xml");
const ZBMATH: &str = include_str!("../../../fixtures/bibliography/online/zbmath-wiles.json");
#[test]
fn doi_and_cairn_inputs_never_fetch_arbitrary_urls() {
    for q in [
        "10.3917/dbu.jorro.2022.01.0155",
        "https://doi.org/10.3917/dbu.jorro.2022.01.0155",
        "oai:cairn.info:DBU_JORRO_2022_01_0155",
        "https://shs.cairn.info/article/DBU_JORRO_2022_01_0155",
    ] {
        assert_eq!(
            cairn_identifier(q).as_deref(),
            Some("DBU_JORRO_2022_01_0155")
        );
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
fn doi_redirects_only_reach_known_https_metadata_services() {
    for host in [
        "doi.org",
        "data.crosscite.org",
        "api.crossref.org",
        "data.medra.org",
    ] {
        assert!(http::doi_host(
            &reqwest::Url::parse(&format!("https://{host}/test")).unwrap()
        ));
    }
    for url in [
        "http://api.crossref.org/test",
        "https://user@api.crossref.org/test",
        "https://127.0.0.1/test",
        "https://data.crosscite.org:444/test",
        "https://data.crosscite.org.evil.invalid/test",
        "https://publisher.example/article",
    ] {
        assert!(!http::doi_host(&reqwest::Url::parse(url).unwrap()), "{url}");
    }
}
#[test]
fn csl_from_multiple_agencies_round_trips_through_native_hayagriva() {
    for (body, doi, kind) in [
        (CHAPTER, "10.3917/dbu.jorro.2022.01.0155", "chapter"),
        (REPORT, "10.5284/1015681", "report"),
    ] {
        let r = csl_json::parse(body, doi).unwrap();
        assert_eq!(r.provider, Provider::Doi);
        assert_eq!(r.doi.as_deref(), Some(doi));
        assert_eq!(r.entry["type"], kind);
        assert_eq!(
            typstographe_bibliography::parse_native(
                &r.contents,
                typstographe_bibliography::ImportFormat::Hayagriva
            )
            .unwrap()
            .iter()
            .count(),
            1
        );
    }
    let r = csl_json::parse(CHAPTER, "10.3917/dbu.jorro.2022.01.0155").unwrap();
    assert!(r.warnings.contains(&Warning::ChapterTitleMatchesBook));
}
#[test]
fn csl_types_corporate_authors_and_numeric_fields_are_preserved() {
    let data = json!({"type":"article-journal","DOI":"10.1000/native","title":"Example","author":[{"literal":"Example Institute"}],"volume":12,"issue":2,"container-title":"Journal","issued":{"date-parts":[[2025]]}});
    let r = csl_json::parse(&data.to_string(), "10.1000/native").unwrap();
    assert!(r.authors.contains("Example Institute"));
    assert_eq!(r.entry["parent"][0]["type"], "periodical");
    assert_eq!(r.year, Some(2025));
    assert!(r.contents.contains("12"));
}
#[test]
fn a_deposit_timestamp_does_not_become_a_publication_date() {
    let (r, _) = csl_json::entry(
        &json!({"type":"book","title":"Undated","created":{"date-parts":[[2026]]}}),
    );
    assert!(r.get("date").is_none());
}
#[test]
fn malformed_csl_or_a_different_doi_cannot_become_a_notice() {
    for body in ["<html>unavailable</html>", "null", "{}", CHAPTER] {
        assert!(csl_json::parse(body, "10.1000/different").is_err());
    }
    assert!(csl_json::parse(&format!("[{REPORT},{REPORT}]"), "10.5284/1015681").is_err());
    assert!(zbmath::parse("{}").is_err());
}
#[test]
fn cairn_uses_only_explicit_page_metadata_and_rejects_conflicting_identifiers() {
    assert_eq!(
        cairn::page_doi(r#"<meta content='10.3917/dbu.jorro.2022.01.0155' name='citation_doi'>"#)
            .as_deref(),
        Some("10.3917/dbu.jorro.2022.01.0155")
    );
    assert!(cairn::page_doi("<p>See 10.3917/dbu.jorro.2022.01.0155</p>").is_none());
    assert!(cairn::page_doi(r#"<meta name="citation_doi" content="10.1000/first"><meta name="citation_doi" content="10.1000/second">"#).is_none());
    let r = cairn::parse(CAIRN, "DBU_JORRO_2022_01_0155")
        .unwrap()
        .unwrap();
    assert_eq!(r.entry["title"], "Émancipation");
    assert_eq!(r.entry["page-range"], "155-159");
    assert!(cairn::parse(CAIRN, "WRONG_ID").is_err());
    assert!(
        cairn::parse(
            "<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///etc/passwd'>]><x>&y;</x>",
            "X_Y"
        )
        .is_err()
    );
}
fn request(query: &str, sources: Vec<Provider>) -> Search {
    Search {
        query: query.into(),
        sources,
        limit: 8,
    }
}
type Reply = (u16, String, String);
async fn server(
    response: impl Fn(&str) -> Reply + Send + Sync + 'static,
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
                let (status, body, extra) = response(std::str::from_utf8(&request[..n]).unwrap());
                let headers = format!(
                    "HTTP/1.1 {status} Response\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n",
                    body.len()
                );
                let _ = socket.write_all(headers.as_bytes()).await;
                let _ = socket.write_all(body.as_bytes()).await;
            });
        }
    });
    (url, handle)
}
fn ok(body: &str) -> Reply {
    (200, body.into(), String::new())
}
fn empty() -> Reply {
    (404, String::new(), String::new())
}
#[tokio::test]
async fn author_search_and_successful_zbmath_lookup_never_call_the_doi_fallback() {
    let (url, task) = server(|s| {
        assert!(s.contains("GET /zbmath?"));
        assert!(s.contains("search_string=Wiles"));
        ok(ZBMATH)
    })
    .await;
    let r = Client::testing(&url)
        .search(request("Wiles", vec![Provider::Cairn, Provider::Zbmath]))
        .await;
    assert!(r.issues.is_empty());
    assert_eq!(r.candidates.len(), 1);
    assert_eq!(r.candidates[0].provider, Provider::Zbmath);
    task.abort();
}
#[tokio::test]
async fn natural_author_year_search_keeps_records_with_only_a_numeric_id() {
    let (url, task) = server(|s| {
        let path = s.split_whitespace().nth(1).unwrap();
        let url = reqwest::Url::parse(&format!("http://localhost{path}")).unwrap();
        assert_eq!(url.path(), "/zbmath");
        let params: std::collections::BTreeMap<_, _> = url.query_pairs().collect();
        assert_eq!(params["search_string"], "klutchnikoff 2025");
        assert_eq!(params["results_per_page"], "9");
        let data: serde_json::Value = serde_json::from_str(ZBMATH).unwrap();
        let mut numbered = data["result"][0].clone();
        numbered["year"] = json!("2025");
        let mut pending = numbered.clone();
        pending["identifier"] = serde_json::Value::Null;
        pending["id"] = json!(8110214);
        ok(&json!({"result": [numbered, pending]}).to_string())
    })
    .await;
    let mut search = request("klutchnikoff 2025", vec![Provider::Zbmath]);
    search.limit = 9;
    let result = Client::testing(&url).search(search).await;
    assert!(result.issues.is_empty());
    assert_eq!(result.candidates.len(), 2);
    let pending = &result.candidates[1];
    assert_eq!(pending.year, Some(2025));
    assert_eq!(
        pending.source_url,
        "https://api.zbmath.org/v1/document/8110214"
    );
    assert_eq!(pending.doi.as_deref(), Some("10.2307/2118559"));
    task.abort();
}

#[tokio::test]
async fn a_successful_specialised_doi_lookup_does_not_request_generic_metadata() {
    let (url, task) = server(|s| {
        assert!(s.contains("GET /zbmath?"));
        assert!(s.contains("doi%3A10.2307%2F2118559"));
        ok(ZBMATH)
    })
    .await;
    let r = Client::testing(&url)
        .search(request(
            "10.2307/2118559",
            vec![Provider::Zbmath, Provider::Doi],
        ))
        .await;
    assert_eq!(r.candidates[0].provider, Provider::Zbmath);
    assert!(r.issues.is_empty());
    task.abort();
}
#[tokio::test]
async fn cairn_keeps_its_own_fields_and_uses_generic_parent_metadata_only() {
    let (url, task) = server(|s| {
        if s.contains("GET /cairn?") {
            ok(CAIRN)
        } else {
            assert!(s.contains("GET /doi/10.3917/dbu.jorro.2022.01 "));
            ok(BOOK)
        }
    })
    .await;
    let r = Client::testing(&url)
        .search(request(
            "10.3917/dbu.jorro.2022.01.0155",
            vec![Provider::Cairn],
        ))
        .await;
    assert!(r.issues.is_empty());
    assert_eq!(r.candidates.len(), 1);
    let c = &r.candidates[0];
    assert_eq!(c.provider, Provider::Cairn);
    assert_eq!(c.title, "Émancipation");
    assert_eq!(c.entry["date"], 2022);
    assert_eq!(c.entry["parent"][0]["type"], "book");
    assert!(!c.warnings.contains(&Warning::ParentUnavailable));
    task.abort();
}
#[tokio::test]
async fn incomplete_specialised_metadata_remains_usable_without_generic_replacement() {
    let (url, task) = server(|s| {
        if s.contains("/cairn?") {
            ok(CAIRN)
        } else {
            (503, String::new(), String::new())
        }
    })
    .await;
    let r = Client::testing(&url)
        .search(request(
            "10.3917/dbu.jorro.2022.01.0155",
            vec![Provider::Cairn],
        ))
        .await;
    assert!(r.issues.is_empty());
    assert_eq!(r.candidates.len(), 1);
    assert_eq!(r.candidates[0].provider, Provider::Cairn);
    assert!(
        r.candidates[0]
            .warnings
            .contains(&Warning::ParentUnavailable)
    );
    task.abort();
}
#[tokio::test]
async fn generic_fallback_runs_after_specialised_absence_and_keeps_its_provenance() {
    let calls = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let events = calls.clone();
    let (url, task) = server(move |s| {
        events
            .lock()
            .unwrap()
            .push(s.lines().next().unwrap().to_string());
        if s.contains("/doi/") {
            assert!(
                s.to_lowercase()
                    .contains("accept: application/vnd.citationstyles.csl+json")
            );
            ok(REPORT)
        } else {
            empty()
        }
    })
    .await;
    let r = Client::testing(&url)
        .search(request(
            "10.5284/1015681",
            vec![Provider::Zbmath, Provider::Cairn],
        ))
        .await;
    assert!(r.issues.is_empty());
    assert_eq!(r.candidates[0].provider, Provider::Doi);
    let calls = calls.lock().unwrap();
    assert_eq!(calls.len(), 2);
    assert!(calls[0].contains("/zbmath?"));
    assert!(calls[1].contains("/doi/"));
    task.abort();
}
#[tokio::test]
async fn generic_fallback_preserves_specialised_errors_instead_of_hiding_them() {
    let (url, task) = server(|s| {
        if s.contains("/doi/") {
            ok(REPORT)
        } else {
            (503, String::new(), String::new())
        }
    })
    .await;
    let r = Client::testing(&url)
        .search(request("10.5284/1015681", vec![Provider::Zbmath]))
        .await;
    assert_eq!(r.candidates[0].provider, Provider::Doi);
    assert_eq!(r.issues[0].provider, Provider::Zbmath);
    assert_eq!(r.issues[0].code, ErrorCode::Unavailable);
    task.abort();
}
#[tokio::test]
async fn cairn_failure_uses_the_generic_notice_only_after_both_specialists_finish() {
    let (url, task) = server(|s| {
        if s.contains("/doi/") {
            ok(CHAPTER)
        } else {
            empty()
        }
    })
    .await;
    let r = Client::testing(&url)
        .search(request(
            "10.3917/dbu.jorro.2022.01.0155",
            vec![Provider::Zbmath, Provider::Cairn],
        ))
        .await;
    assert_eq!(r.candidates.len(), 1);
    assert_eq!(r.candidates[0].provider, Provider::Doi);
    assert!(
        r.candidates[0]
            .warnings
            .contains(&Warning::ChapterTitleMatchesBook)
    );
    task.abort();
}
#[tokio::test]
async fn doi_negotiation_follows_bounded_redirects_and_rejects_html_or_wrong_dois() {
    for (destination, code) in [
        ("/metadata", None),
        ("/doi/10.5284/1015681", Some(ErrorCode::InvalidResponse)),
        (
            "http://127.0.0.1:1/metadata",
            Some(ErrorCode::UnsupportedResponse),
        ),
    ] {
        let (url, task) = server(move |s| {
            if s.contains("GET /doi/") {
                (302, String::new(), format!("Location: {destination}\r\n"))
            } else {
                ok(REPORT)
            }
        })
        .await;
        let r = Client::testing(&url)
            .search(request("10.5284/1015681", vec![Provider::Doi]))
            .await;
        assert_eq!(r.issues.first().map(|e| e.code), code);
        if code.is_none() {
            assert_eq!(r.candidates.len(), 1);
        }
        task.abort();
    }
    let (url, task) = server(|_| ok(CHAPTER)).await;
    let r = Client::testing(&url)
        .search(request("10.5284/1015681", vec![Provider::Doi]))
        .await;
    assert!(r.candidates.is_empty());
    assert_eq!(r.issues[0].code, ErrorCode::InvalidResponse);
    task.abort();
}
#[tokio::test]
async fn no_metadata_errors_rate_limits_and_size_bounds_remain_distinct() {
    for (status, body, code) in [
        (404, String::new(), None),
        (204, String::new(), None),
        (406, String::new(), Some(ErrorCode::UnsupportedResponse)),
        (429, String::new(), Some(ErrorCode::RateLimited)),
        (
            200,
            "<html>unavailable</html>".into(),
            Some(ErrorCode::InvalidResponse),
        ),
        (
            200,
            "x".repeat(2 * 1024 * 1024 + 1),
            Some(ErrorCode::TooLarge),
        ),
    ] {
        let (url, task) =
            server(move |_| (status, body.clone(), "Retry-After: 7\r\n".into())).await;
        let r = Client::testing(&url)
            .search(request("10.5284/1015681", vec![Provider::Doi]))
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
async fn invalid_queries_and_cairn_free_text_do_not_reach_transport() {
    let (url, task) = server(|_| panic!("no network expected")).await;
    for q in ["", "\n", &"x".repeat(513)] {
        let r = Client::testing(&url)
            .search(request(q, vec![Provider::Doi]))
            .await;
        assert_eq!(r.issues[0].code, ErrorCode::InvalidQuery);
    }
    let r = Client::testing(&url)
        .search(request("an author", vec![Provider::Cairn]))
        .await;
    assert_eq!(r.issues[0].code, ErrorCode::UnsupportedQuery);
    task.abort();
}
#[tokio::test]
async fn a_stalled_response_times_out_without_any_documentary_publication() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let (_socket, _) = listener.accept().await.unwrap();
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
    });
    let r = Client::testing(&url)
        .search(request("10.5284/1015681", vec![Provider::Doi]))
        .await;
    assert_eq!(r.issues[0].code, ErrorCode::Timeout);
    task.abort();
}

#[tokio::test]
async fn a_specialist_returning_another_doi_is_rejected_before_generic_fallback() {
    let (url, task) = server(|s| {
        if s.contains("GET /zbmath?") {
            ok(ZBMATH)
        } else {
            ok(REPORT)
        }
    })
    .await;
    let r = Client::testing(&url)
        .search(request("10.5284/1015681", vec![Provider::Zbmath]))
        .await;
    assert_eq!(r.candidates.len(), 1);
    assert_eq!(r.candidates[0].provider, Provider::Doi);
    assert_eq!(r.candidates[0].doi.as_deref(), Some("10.5284/1015681"));
    assert_eq!(r.issues[0].code, ErrorCode::InvalidResponse);
    task.abort();
}

#[tokio::test]
async fn an_unavailable_cairn_page_requests_an_identifier_instead_of_scraping() {
    let (url, task) = server(|_| (403, String::new(), String::new())).await;
    let error = http::Http::testing(&url)
        .get(
            Provider::Cairn,
            reqwest::Url::parse(&url).unwrap(),
            "text/html",
        )
        .await
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::IdentifierRequired);
    task.abort();
}
