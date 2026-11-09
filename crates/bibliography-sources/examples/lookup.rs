//! Explicit live qualification, never run by the offline test suite.
use typstographe_bibliography_sources::{Client, Provider, Search};
#[tokio::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let query = args
        .next()
        .expect("Usage: lookup QUERY [doi|zbmath|cairn|all]");
    let sources = match args.next().as_deref().unwrap_or("all") {
        "doi" => vec![Provider::Doi],
        "zbmath" => vec![Provider::Zbmath],
        "cairn" => vec![Provider::Cairn],
        "all" => vec![Provider::Zbmath, Provider::Cairn],
        _ => panic!("Unknown provider"),
    };
    let result = Client::new()
        .unwrap()
        .search(Search {
            query,
            sources,
            limit: 5,
        })
        .await;
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
}
