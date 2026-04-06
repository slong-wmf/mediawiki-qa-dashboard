/**
 * Extensions currently deployed on en.wikipedia.org.
 *
 * Generated 2026-04-03 from:
 *   https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=extensions&format=json
 *
 * All 136 entries had a Gerrit vcs-date within the last 6 months as of generation,
 * confirming active maintenance. The 8 skins/captcha entries (Vector, MonoBook, etc.)
 * that lacked Gerrit extension URLs are excluded — they are not MediaWiki extensions.
 *
 * Coverage names are matched case-sensitively against doc.wikimedia.org/cover-extensions/
 * directory names. A small alias map handles the known mismatches (e.g. spaces, capitalisation).
 */

/** Set of extension names as they appear in doc.wikimedia.org/cover-extensions/ URLs. */
export const WIKIPEDIA_DEPLOYED = new Set([
  '3D',
  'AbuseFilter',
  'AdvancedSearch',
  'AntiSpoof',
  'ApiFeatureUsage',
  'ArticleCreationWorkflow',
  'Babel',
  'BetaFeatures',
  'BounceHandler',
  'CampaignEvents',
  'Campaigns',
  'CategoryTree',
  'CentralAuth',
  'CentralNotice',
  'CharInsert',
  'Chart',
  'CheckUser',
  'CirrusSearch',
  'Cite',
  'CiteThisPage',
  'Citoid',
  'cldr',
  'CodeEditor',
  'CodeMirror',
  'Collection',
  'CologneBlue',
  'CommonsMetadata',
  'CommunityConfiguration',
  'ConfirmEdit',
  'ContactPage',
  'ContentTranslation',
  'Disambiguator',
  'DiscussionTools',
  'DismissableSiteNotice',
  'Echo',
  'Elastica',
  'ElectronPdfService',
  'EmailAuth',
  'EntitySchema',
  'EventBus',
  'EventLogging',
  'EventStreamConfig',
  'ExternalGuidance',
  'FeaturedFeeds',
  'FileExporter',
  'FlaggedRevs',
  'Gadgets',
  'GeoData',
  'GlobalBlocking',
  'GlobalCssJs',
  'GlobalPreferences',
  'GlobalUsage',
  'GlobalUserPage',
  'GrowthExperiments',
  'GuidedTour',
  'ImageMap',
  'InputBox',
  'IPInfo',
  'IPReputation',
  'JsonConfig',
  'Kartographer',
  'LabeledSectionTransclusion',
  'Linter',
  'LoginNotify',
  'Math',
  'MediaModeration',
  'MinervaNeue',
  'MobileApp',
  'MobileFrontend',
  'MultimediaViewer',
  'NavigationTiming',
  'NearbyPages',
  'Nuke',
  'OATHAuth',
  'OAuth',
  'ORES',
  'PageAssessments',
  'PagedTiffHandler',
  'PageImages',
  'PageTriage',
  'PageViewInfo',
  'ParserFunctions',
  'ParserMigration',
  'PdfHandler',
  'PersonalDashboard',
  'Phonos',
  'Poem',
  'Popups',
  'QuickSurveys',
  'ReaderExperiments',
  'ReadingLists',
  'RealMe',
  'RelatedArticles',
  'RevisionSlider',
  'SandboxLink',
  'Score',
  'Scribunto',
  'SecureLinkFixer',
  'SecurePoll',
  'SiteMatrix',
  'SpamBlacklist',
  'SyntaxHighlight_GeSHi',
  'TemplateData',
  'TemplateSandbox',
  'TemplateStyles',
  'TemplateWizard',
  'TestKitchen',
  'TextExtracts',
  'Thanks',
  'TheWikipediaLibrary',
  'TimedMediaHandler',
  'TitleBlacklist',
  'TorBlock',
  'TrustedXFF',
  'TwoColConflict',
  'UniversalLanguageSelector',
  'UrlShortener',
  'VisualEditor',
  'Wikibase',
  'WikibaseLexeme',
  'WikiEditor',
  'wikihiero',
  'WikiLove',
  'WikimediaBadges',
  'WikimediaCampaignEvents',
  'WikimediaCustomizations',
  'WikimediaEvents',
  'WikimediaMessages',
  'XAnalytics',
]);

/**
 * Aliases: some coverage-page directory names differ slightly from the
 * extension name returned by the Wikipedia siteinfo API.
 * Key = coverage page name, Value = canonical name already in WIKIPEDIA_DEPLOYED.
 */
export const COVERAGE_NAME_ALIASES = {
  SyntaxHighlight: 'SyntaxHighlight_GeSHi', // coverage page may use short name
  PDFHandler: 'PdfHandler',
};

/** ISO date this list was generated. */
export const GENERATED_DATE = '2026-04-03';

/** Source used to build this list. */
export const SOURCE = 'en.wikipedia.org siteinfo API + Gerrit vcs-date verification';

/**
 * Returns true if the given coverage-page extension name is considered
 * "active on Wikipedia" — i.e. currently deployed on en.wikipedia.org.
 *
 * @param {string} coverageName  The name as it appears in doc.wikimedia.org/cover-extensions/
 */
export function isActiveOnWikipedia(coverageName) {
  if (WIKIPEDIA_DEPLOYED.has(coverageName)) return true;
  const alias = COVERAGE_NAME_ALIASES[coverageName];
  return alias ? WIKIPEDIA_DEPLOYED.has(alias) : false;
}
