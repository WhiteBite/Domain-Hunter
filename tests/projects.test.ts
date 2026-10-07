import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  addProject,
  MAX_PROJECTS,
  parseDomainList,
  projectCsv,
  projectJson,
  projects,
  removeProject,
  setProjectDomains,
  patchProject,
  MAX_PROJECT_DOMAINS,
  type Project,
} from '../src/ui/projects';

beforeEach(() => {
  projects.set([]);
});

describe('parseDomainList', () => {
  it('splits on whitespace and commas, dedupes, lowercases', () => {
    expect(parseDomainList('Alpha.com beta.io alpha.com,beta.io')).toEqual([
      'alpha.com',
      'beta.io',
    ]);
  });

  it('drops entries without a dot and blanks', () => {
    expect(parseDomainList('nodot com.com ,  \n\t')).toEqual(['com.com']);
  });

  it('caps the list length', () => {
    const out = parseDomainList('a.com b.com c.com d.com', 3);
    expect(out).toEqual(['a.com', 'b.com', 'c.com']);
  });

  it('defaults to the storage cap', () => {
    const text = Array.from({ length: MAX_PROJECT_DOMAINS + 5 }, (_, i) => `d${i}.com`).join(' ');
    expect(parseDomainList(text)).toHaveLength(MAX_PROJECT_DOMAINS);
  });
});

describe('project store', () => {
  it('addProject appends with a palette color and returns it', () => {
    const p = addProject('Brand A');
    expect(p).not.toBeNull();
    const list = get(projects);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Brand A');
    expect(list[0]?.color).toBe(0);
    expect(p?.id).toBe(list[0]?.id);
  });

  it('addProject rejects empty names and nulls at the cap', () => {
    expect(addProject('   ')).toBeNull();
    for (let i = 0; i < MAX_PROJECTS; i++) addProject(`p${i}`);
    expect(get(projects)).toHaveLength(MAX_PROJECTS);
    expect(addProject('overflow')).toBeNull();
  });

  it('patchProject updates name/note only for the matching id', () => {
    const a = addProject('A');
    addProject('B');
    patchProject(a?.id ?? '', { note: 'note-a', name: 'A2' });
    const list = get(projects);
    expect(list.find((p) => p.id === a?.id)).toMatchObject({ name: 'A2', note: 'note-a' });
    expect(list.find((p) => p.name === 'B')?.note).toBe('');
  });

  it('setProjectDomains parses and normalizes the text', () => {
    const a = addProject('A');
    setProjectDomains(a?.id ?? '', 'X.com y.io x.com');
    expect(get(projects)[0]?.domains).toEqual(['x.com', 'y.io']);
  });

  it('removeProject drops only the matching id', () => {
    const a = addProject('A');
    const b = addProject('B');
    removeProject(a?.id ?? '');
    expect(get(projects).map((p) => p.id)).toEqual([b?.id]);
  });
});

describe('project exports', () => {
  const P: Project = {
    id: 'p1',
    name: 'Brand A',
    color: 0,
    note: 'note',
    domains: ['alpha.com', 'beta.io'],
  };

  it('projectCsv carries BOM, header and rows', () => {
    const csv = projectCsv(P);
    expect(csv.startsWith(String.fromCharCode(0xfeff))).toBe(true);
    expect(csv).toContain('domain,project');
    expect(csv).toContain('alpha.com,Brand A');
    expect(csv).toContain('beta.io,Brand A');
  });

  it('projectJson round-trips the full project', () => {
    expect(JSON.parse(projectJson(P))).toEqual(P);
  });
});
