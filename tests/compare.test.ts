/**
 * The comparison panel's two pieces of logic.
 *
 * `findDeprecatedClaims` is what decides whether the left-hand column gets the
 * red "relies on a rule that no longer exists" banner. If it were loose enough
 * to fire on any mention of profanity, the panel would be making the same kind
 * of unverifiable claim it exists to criticise.
 */
import { describe, expect, it } from 'vitest';
import { findDeprecatedClaims, parseIssues } from '../scripts/make-naive-compare';
import { categoryOf } from '../components/SelfCertSheet';

describe('detecting a deleted rule in free text', () => {
  it('catches the seven-second rule however it is phrased', () => {
    expect(findDeprecatedClaims('Strong profanity in the first 7 seconds limits ads.')).toContain(
      'first 7 seconds',
    );
    expect(findDeprecatedClaims('avoid swearing within the first seven seconds')).toContain(
      'first 7 seconds',
    );
  });

  it('catches the older fifteen-second version', () => {
    expect(findDeprecatedClaims('any profanity in the first 15 seconds')).toContain(
      'first 15 seconds',
    );
  });

  it('does not fire on a correct statement of current policy', () => {
    expect(
      findDeprecatedClaims(
        'Profanity used repeatedly or throughout the video may receive limited ads. ' +
          'Profanity in the title or thumbnail earns no ad revenue.',
      ),
    ).toHaveLength(0);
  });

  it('does not fire merely because profanity is mentioned', () => {
    expect(findDeprecatedClaims('There is profanity at 0:55 in this video.')).toHaveLength(0);
  });
});

describe('parsing a free-text response into issues', () => {
  it('reads bulleted and numbered lists', () => {
    const issues = parseIssues(
      'Here are the problems:\n' +
        '- Profanity in the first 7 seconds: demonetized\n' +
        '2. Sensitive event discussion, limited ads\n' +
        'Some trailing prose.',
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].severity).toBe('no ads');
    expect(issues[1].severity).toBe('limited ads');
  });

  it('marks severity unspecified rather than guessing', () => {
    expect(parseIssues('- Something vague about tone')[0].severity).toBe('unspecified');
  });
});

describe('self-certification category mapping', () => {
  it('maps every clause prefix in the shipped pack', () => {
    for (const id of [
      'AFG-LANG-002',
      'AFG-PKG-001',
      'AFG-VIOL-001',
      'AFG-SENS-001',
      'AFG-ADULT-001',
      'AFG-DRUG-001',
      'AFG-HARM-001',
      'AFG-CONTRO-001',
      'AFG-FIRE-001',
      'AFG-SHOCK-001',
    ]) {
      expect(categoryOf(id), id).not.toBe('unknown');
    }
  });

  it('returns unknown rather than guessing for an unrecognised prefix', () => {
    expect(categoryOf('AFG-NOPE-001')).toBe('unknown');
  });
});
