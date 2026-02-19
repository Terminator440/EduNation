import { describe, it, expect } from "vitest";
import {
  roundPartialAverage,
  roundFinalGrade,
  weightedAverage,
} from "./gradeAverage";

describe("gradeAverage", () => {
  describe("roundPartialAverage", () => {
    it("returns 0 for empty array", () => {
      expect(roundPartialAverage([])).toBe(0);
    });
    it("returns the grade for single value", () => {
      expect(roundPartialAverage([8])).toBe(8);
      expect(roundPartialAverage([7.5])).toBe(7.5);
    });
    it("rounds to two decimals", () => {
      expect(roundPartialAverage([8, 9, 7])).toBe(8);
      expect(roundPartialAverage([8, 8, 9])).toBe(8.33);
      expect(roundPartialAverage([5, 6, 7, 8])).toBe(6.5);
    });
  });

  describe("roundFinalGrade", () => {
    it("clamps to 1-10", () => {
      expect(roundFinalGrade(0.4)).toBe(1);
      expect(roundFinalGrade(10.6)).toBe(10);
    });
    it("rounds .5 up (Romanian rule)", () => {
      expect(roundFinalGrade(7.5)).toBe(8);
      expect(roundFinalGrade(5.5)).toBe(6);
    });
    it("rounds normally for other decimals", () => {
      expect(roundFinalGrade(7.4)).toBe(7);
      expect(roundFinalGrade(7.6)).toBe(8);
    });
  });

  describe("weightedAverage", () => {
    it("returns 0 when no grades", () => {
      expect(weightedAverage([], null)).toBe(0);
    });
    it("returns partial average when no teza", () => {
      expect(weightedAverage([8, 9, 7], null)).toBe(8);
    });
    it("applies 25% teza weight", () => {
      const normal = [8, 8, 8];
      expect(roundPartialAverage(normal)).toBe(8);
      expect(weightedAverage(normal, 10, 0.25)).toBe(8.5);
    });
  });
});
