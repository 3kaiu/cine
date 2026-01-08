use cine_backend::services::scraper;

#[test]
fn test_parse_filename_movie() {
    let (title, year, season, episode) = scraper::parse_filename("The Matrix (1999).mp4");
    assert_eq!(title, "The Matrix");
    assert_eq!(year, Some(1999));
    assert!(season.is_none());
    assert!(episode.is_none());
}

#[test]
fn test_parse_filename_tv_show() {
    let (title, year, season, episode) = scraper::parse_filename("Game of Thrones S01E01.mp4");
    assert_eq!(title, "Game of Thrones");
    assert!(year.is_none());
    assert_eq!(season, Some(1));
    assert_eq!(episode, Some(1));
}

#[test]
fn test_parse_filename_tv_show_with_year() {
    let (title, year, season, episode) = scraper::parse_filename("Breaking Bad (2008) S05E16.mkv");
    assert_eq!(title, "Breaking Bad");
    assert_eq!(year, Some(2008));
    assert_eq!(season, Some(5));
    assert_eq!(episode, Some(16));
}

#[test]
fn test_parse_filename_complex() {
    let (title, year, season, episode) = scraper::parse_filename("The.Office.US.S03E05.1080p.BluRay.x264.mkv");
    assert!(title.contains("Office"));
    assert_eq!(season, Some(3));
    assert_eq!(episode, Some(5));
}
