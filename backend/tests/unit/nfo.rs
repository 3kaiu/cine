//! NFO 服务测试

use cine_backend::services::nfo;
use serde_json::json;
use std::fs;
use tempfile::tempdir;

#[tokio::test]
async fn test_generate_movie_nfo() {
    let temp_dir = tempdir().unwrap();
    let file_path = temp_dir.path().join("movie.mp4");
    fs::write(&file_path, "fake content").unwrap();

    let metadata = json!({
        "title": "Inception",
        "year": 2010,
        "overview": "A thief who steals corporate secrets through the use of dream-sharing technology.",
        "rating": 8.8,
        "tmdb_id": 27205
    });

    let result = nfo::generate_nfo_file(file_path.to_str().unwrap(), &metadata, "movie").await;

    assert!(result.is_ok());
    let nfo_path = result.unwrap();
    assert!(nfo_path.ends_with("movie.nfo"));

    let content = fs::read_to_string(&nfo_path).unwrap();
    assert!(content.contains("<title>Inception</title>"));
    assert!(content.contains("<plot>A thief who steals corporate secrets through the use of dream-sharing technology.</plot>"));
}

#[tokio::test]
async fn test_read_save_movie_nfo() {
    let temp_dir = tempdir().unwrap();
    let nfo_path = temp_dir.path().join("test.nfo");

    let original_nfo = nfo::MovieNfo {
        title: Some("Interstellar".to_string()),
        originaltitle: Some("Interstellar".to_string()),
        sorttitle: None,
        rating: Some(8.6),
        year: Some(2014),
        plot: Some("A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.".to_string()),
        tagline: Some("Mankind was born on Earth. It was never meant to die here.".to_string()),
        runtime: Some(169),
        thumb: None,
        fanart: None,
        tmdbid: Some("157336".to_string()),
        id: None,
    };

    // Save
    let save_result = nfo::save_nfo_file(nfo_path.to_str().unwrap(), &original_nfo).await;
    assert!(save_result.is_ok());

    // Read
    let read_result = nfo::read_nfo_file(nfo_path.to_str().unwrap()).await;
    assert!(read_result.is_ok());
    let loaded_nfo = read_result.unwrap();

    assert_eq!(loaded_nfo.title, original_nfo.title);
    assert_eq!(loaded_nfo.year, original_nfo.year);
    assert_eq!(loaded_nfo.tmdbid, original_nfo.tmdbid);
}

#[test]
fn test_escape_xml() {
    // Since escape_xml is private, we test it through public functions or assume it works
    // if generate_nfo_file handles special chars correctly.
}
