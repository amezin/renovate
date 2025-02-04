import is from '@sindresorhus/is';
import type { SemVer } from 'semver';
import semver from 'semver';
import stable from 'semver-stable';
import { regEx } from '../../../util/regex';
import type { NewValueConfig, VersioningApi } from '../types';

export const id = 'semver-coerced';
export const displayName = 'Coerced Semantic Versioning';
export const urls = ['https://semver.org/'];
export const supportsRanges = false;

function isStable(version: string): boolean {
  // matching a version with the semver prefix
  // v1.2.3, 1.2.3, v1.2, 1.2, v1, 1
  const regx = regEx(
    /^v?(?<major>\d+)(?<minor>\.\d+)?(?<patch>\.\d+)?(?<others>.+)?/,
  );
  const m = regx.exec(version);

  if (!m?.groups) {
    return false;
  }

  const major = m.groups['major'];
  const newMinor = m.groups['minor'] ?? '.0';
  const newPatch = m.groups['patch'] ?? '.0';
  const others = m.groups['others'] ?? '';
  const fixed = major + newMinor + newPatch + others;
  return stable.is(fixed);
}

function coerce(v: SemVer | string): SemVer | null {
  return semver.coerce(v, { includePrerelease: true });
}

function sortVersions(a: string, b: string): number {
  const aCoerced = coerce(a);
  const bCoerced = coerce(b);

  return aCoerced && bCoerced ? semver.compare(aCoerced, bCoerced) : 0;
}

function getMajor(a: string | SemVer): number | null {
  const aCoerced = coerce(a);
  return aCoerced ? semver.major(aCoerced) : null;
}

function getMinor(a: string | SemVer): number | null {
  const aCoerced = coerce(a);
  return aCoerced ? semver.minor(aCoerced) : null;
}

function getPatch(a: string | SemVer): number | null {
  const aCoerced = coerce(a);
  return aCoerced ? semver.patch(aCoerced) : null;
}

function matches(version: string, range: string): boolean {
  const coercedVersion = coerce(version);
  return coercedVersion ? semver.satisfies(coercedVersion, range) : false;
}

function equals(a: string, b: string): boolean {
  const aCoerced = coerce(a);
  const bCoerced = coerce(b);
  return aCoerced && bCoerced ? semver.eq(aCoerced, bCoerced) : false;
}

function isValid(version: string): boolean {
  return !!semver.valid(coerce(version));
}

function getSatisfyingVersion(
  versions: string[],
  range: string,
): string | null {
  const coercedVersions = versions
    .map((version) =>
      semver.valid(version) ? version : coerce(version)?.version,
    )
    .filter(is.string);

  return semver.maxSatisfying(coercedVersions, range);
}

function minSatisfyingVersion(
  versions: string[],
  range: string,
): string | null {
  const coercedVersions = versions
    .map((version) => coerce(version)?.version)
    .filter(is.string);

  return semver.minSatisfying(coercedVersions, range);
}

function isLessThanRange(version: string, range: string): boolean {
  const coercedVersion = coerce(version);
  return coercedVersion ? semver.ltr(coercedVersion, range) : false;
}

function isGreaterThan(version: string, other: string): boolean {
  const coercedVersion = coerce(version);
  const coercedOther = coerce(other);
  if (!coercedVersion || !coercedOther) {
    return false;
  }
  return semver.gt(coercedVersion, coercedOther);
}

const startsWithNumberRegex = regEx(`^\\d`);

function isSingleVersion(version: string): boolean {
  // Since coercion accepts ranges as well as versions, we have to manually
  // check that the version string starts with either 'v' or a digit.
  if (!version.startsWith('v') && !startsWithNumberRegex.exec(version)) {
    return false;
  }

  return !!semver.valid(coerce(version));
}

// If this is left as an alias, inputs like "17.04.0" throw errors
export const isVersion = (input: string): boolean => isValid(input);

export { isVersion as isValid, getSatisfyingVersion };

function getNewValue({
  currentValue,
  currentVersion,
  newVersion,
}: NewValueConfig): string {
  if (currentVersion === `v${currentValue}`) {
    return newVersion.replace(/^v/, '');
  }
  return newVersion;
}

function isCompatible(version: string): boolean {
  return isVersion(version);
}

export const api: VersioningApi = {
  equals,
  getMajor,
  getMinor,
  getPatch,
  isCompatible,
  isGreaterThan,
  isLessThanRange,
  isSingleVersion,
  isStable,
  isValid,
  isVersion,
  matches,
  getSatisfyingVersion,
  minSatisfyingVersion,
  getNewValue,
  sortVersions,
};
export default api;
