/**
 * Themed word categories — SPEC §10.3.
 * Data derived from license-clean corpora (see dictionaries/LICENSES.md).
 * Signature (ThemeWord / ThemeCategory / themes) is FROZEN for UI use.
 */
import animalsData from '../config/dictionaries/themes/animals.json';
import natureData from '../config/dictionaries/themes/nature.json';
import foodData from '../config/dictionaries/themes/food.json';
import spaceData from '../config/dictionaries/themes/space.json';
import colorsData from '../config/dictionaries/themes/colors.json';
import mythologyData from '../config/dictionaries/themes/mythology.json';
import latinData from '../config/dictionaries/themes/latin.json';

export interface ThemeWord {
  w: string;
  /** Optional meaning hint shown in a tooltip. */
  hint?: string;
}

export interface ThemeCategory {
  id: string;
  /** i18n key for the category label. */
  labelKey: string;
  /** Fallback label if the key is missing. */
  label: string;
  words: ThemeWord[];
}

/** Compact JSON strings use commas for plain words, or | between entries and a tab before each optional hint. Separators must not appear inside the corresponding fields. */
function expandWords(data: string | (string | string[])[]): ThemeWord[] {
  return (typeof data === 'string' ? data.split(data.includes('|') ? '|' : ',') : data).map((item) => {
    const parts = typeof item === 'string' ? item.split('\t') : item;
    return parts.length > 1 ? { w: parts[0]!, hint: parts[1]! } : { w: parts[0]! };
  });
}

export const themes = Array.of<ThemeCategory>(
  {
    id: 'animals',
    labelKey: 'gen.themes.cat.animals',
    label: 'Animals',
    words: expandWords(animalsData),
  },
  {
    id: 'nature',
    labelKey: 'gen.themes.cat.nature',
    label: 'Nature',
    words: expandWords(natureData),
  },
  {
    id: 'food',
    labelKey: 'gen.themes.cat.food',
    label: 'Food',
    words: expandWords(foodData),
  },
  {
    id: 'space',
    labelKey: 'gen.themes.cat.space',
    label: 'Space',
    words: expandWords(spaceData),
  },
  {
    id: 'colors',
    labelKey: 'gen.themes.cat.colors',
    label: 'Colors',
    words: expandWords(colorsData),
  },
  {
    id: 'mythology',
    labelKey: 'gen.themes.cat.mythology',
    label: 'Mythology',
    words: expandWords(mythologyData),
  },
  {
    id: 'latin',
    labelKey: 'gen.themes.cat.latin',
    label: 'Latin',
    words: expandWords(latinData),
  },
);
