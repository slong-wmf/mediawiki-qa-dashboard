/**
 * Amber call-out shown when a steward filter surfaces extensions with no
 * coverage data — links out to MediaWiki docs on adding coverage.
 */
export function NoCoverageNote({ stewardName }) {
  return (
    <div className="rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-300 leading-snug space-y-1">
      <p className="font-medium">
        Some extensions owned by <span className="text-white">{stewardName}</span> have no coverage data (0%).
      </p>
      <p className="text-amber-400/80">
        To add test coverage, see the MediaWiki documentation:
      </p>
      <ul className="list-disc list-inside space-y-0.5 text-amber-400/80">
        <li>
          <a
            href="https://www.mediawiki.org/wiki/Continuous_integration/Code_coverage"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-amber-200 transition-colors"
          >
            CI code coverage overview
          </a>
          {' '}— how coverage is collected and published
        </li>
        <li>
          <a
            href="https://www.mediawiki.org/wiki/Manual:PHP_unit_testing/Writing_unit_tests_for_extensions"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-amber-200 transition-colors"
          >
            PHPUnit for extensions
          </a>
          {' '}— generating Clover XML coverage reports
        </li>
        <li>
          <a
            href="https://www.mediawiki.org/wiki/Selenium/Node.js"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-amber-200 transition-colors"
          >
            Selenium / Node.js (JUnit)
          </a>
          {' '}— browser test coverage via JUnit XML
        </li>
      </ul>
    </div>
  );
}
