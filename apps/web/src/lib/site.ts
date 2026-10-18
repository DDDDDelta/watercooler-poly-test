import { SITE_COPY, type SiteCopy } from './site-copy';

/** Instance name from SITE_NAME at build time, e.g. "Watercooler" or "gang-bet". */
export const SITE_NAME = import.meta.env.SITE_NAME;

/** This instance's copy (SITE_COPY at build time). */
export const COPY: SiteCopy = SITE_COPY[import.meta.env.SITE_COPY];
