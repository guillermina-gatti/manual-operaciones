import {
  PROCEDURE_IDS,
  PROCEDURE_VERSION_IDS,
} from '../../executions/adapters/procedure-fixtures';
import { DEMO_PROCEDURES } from './demo-procedures';

const byId = (id: string) => DEMO_PROCEDURES.find((p) => p.id === id)!;
const statuses = (id: string) => byId(id).versions.map((v) => v.status);

describe('DEMO_PROCEDURES', () => {
  it('has the 8 procedures of Supermercado La Esquina', () => {
    expect(DEMO_PROCEDURES).toHaveLength(8);
  });

  it('gives every version 3 to 6 steps numbered by position', () => {
    // Arrange
    const published = DEMO_PROCEDURES.flatMap((p) => p.versions).filter(
      (v) => v.status !== 'DRAFT',
    );
    // Act / Assert
    for (const version of published) {
      expect(version.steps.length).toBeGreaterThanOrEqual(3);
      expect(version.steps.length).toBeLessThanOrEqual(6);
    }
  });

  it('has at most one draft and one published version per procedure', () => {
    for (const p of DEMO_PROCEDURES) {
      expect(
        p.versions.filter((v) => v.status === 'DRAFT').length,
      ).toBeLessThanOrEqual(1);
      expect(
        p.versions.filter((v) => v.status === 'PUBLISHED').length,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('uses unique ids and keeps stepKey unique inside each version', () => {
    const all = DEMO_PROCEDURES.flatMap((p) => [
      p.id,
      ...p.versions.flatMap((v) => [v.id, ...v.steps.map((s) => s.id)]),
    ]);
    expect(new Set(all).size).toBe(all.length);
    for (const v of DEMO_PROCEDURES.flatMap((p) => p.versions)) {
      expect(new Set(v.steps.map((s) => s.stepKey)).size).toBe(v.steps.length);
    }
  });

  it('requires a 1..300 summary for every critical change and sets publishedAt on published ones', () => {
    for (const v of DEMO_PROCEDURES.flatMap((p) => p.versions)) {
      if (v.isCritical)
        expect(v.changeSummary!.trim().length).toBeGreaterThanOrEqual(1);
      if (v.changeSummary)
        expect(v.changeSummary.length).toBeLessThanOrEqual(300);
      expect(v.publishedAt !== null).toBe(v.status !== 'DRAFT');
    }
  });

  it('reuses the fixture ids for cierre de caja and recepción de mercadería', () => {
    expect(byId(PROCEDURE_IDS.cierreDeCaja).versions.map((v) => v.id)).toEqual([
      PROCEDURE_VERSION_IDS.cierreDeCajaV1,
      PROCEDURE_VERSION_IDS.cierreDeCajaV2,
    ]);
    expect(byId(PROCEDURE_IDS.recepcionMercaderia).versions[0].id).toBe(
      PROCEDURE_VERSION_IDS.recepcionMercaderiaV1,
    );
  });

  it('shapes the versions as the demo requires', () => {
    expect(statuses(PROCEDURE_IDS.cierreDeCaja)).toEqual([
      'SUPERSEDED',
      'PUBLISHED',
    ]);
    expect(byId(PROCEDURE_IDS.cierreDeCaja).versions[1].isCritical).toBe(true);
    expect(
      DEMO_PROCEDURES.filter((p) =>
        p.versions.every((v) => v.status === 'DRAFT'),
      ),
    ).toHaveLength(1);
    expect(DEMO_PROCEDURES.filter((p) => p.areas.length === 2)).toHaveLength(1);
  });

  it('keeps the same stepKey for kept steps and drops, adds and changes one in limpieza', () => {
    // Arrange
    const limpieza = DEMO_PROCEDURES.find(
      (p) => p.versions[0].title === 'Limpieza del depósito',
    )!;
    const [v1, v2] = limpieza.versions;
    const keys1 = v1.steps.map((s) => s.stepKey);
    const keys2 = v2.steps.map((s) => s.stepKey);
    // Act
    const added = keys2.filter((k) => !keys1.includes(k));
    const removed = keys1.filter((k) => !keys2.includes(k));
    const modified = v2.steps.filter((s) => {
      const before = v1.steps.find((b) => b.stepKey === s.stepKey);
      return before && before.description !== s.description;
    });
    // Assert
    expect([added.length, removed.length, modified.length]).toEqual([1, 1, 1]);
    expect(v2.isCritical).toBe(true);
  });
});
