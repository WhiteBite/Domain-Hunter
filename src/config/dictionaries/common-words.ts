import compact from './words-common.json';

/** Preserve the original ranked list while avoiding repeated JSON punctuation. */
export const commonWords = compact.split(',');
