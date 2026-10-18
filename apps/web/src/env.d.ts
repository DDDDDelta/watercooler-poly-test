interface ImportMetaEnv {
  /** Build-time instance settings, see vite.config.ts. Use them through lib/site.ts. */
  readonly SITE_NAME: string;
  readonly SITE_COPY: import('./lib/site-copy').SiteCopyName;
}
