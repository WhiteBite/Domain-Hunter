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

export const themes: ThemeCategory[] = [
  {
    id: 'animals',
    labelKey: 'gen.themes.cat.animals',
    label: 'Animals',
    words: animalsData as ThemeWord[],
  },
  {
    id: 'nature',
    labelKey: 'gen.themes.cat.nature',
    label: 'Nature',
    words: natureData as ThemeWord[],
  },
  {
    id: 'food',
    labelKey: 'gen.themes.cat.food',
    label: 'Food',
    words: foodData as ThemeWord[],
  },
  {
    id: 'space',
    labelKey: 'gen.themes.cat.space',
    label: 'Space',
    words: spaceData as ThemeWord[],
  },
  {
    id: 'colors',
    labelKey: 'gen.themes.cat.colors',
    label: 'Colors',
    words: colorsData as ThemeWord[],
  },
  {
    id: 'mythology',
    labelKey: 'gen.themes.cat.mythology',
    label: 'Mythology',
    words: mythologyData as ThemeWord[],
  },
  {
    id: 'latin',
    labelKey: 'gen.themes.cat.latin',
    label: 'Latin',
    words: latinData as ThemeWord[],
  },
];
