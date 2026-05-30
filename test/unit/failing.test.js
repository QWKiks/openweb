import { describe, it } from "node:test";
import assert from "node:assert";

describe("50 Deliberately Failing Tests Suite", () => {
  it("1: should fail on basic equality assertion", () => {
    assert.strictEqual(1, 2, "1 should be equal to 2 (deliberately failing)");
  });

  it("2: should fail on checking truthiness", () => {
    assert.ok(false, "Value is not truthy");
  });

  it("3: should fail on unexpected error thrown", () => {
    throw new Error("Deliberate error in test 3");
  });

  it("4: should fail when checking object equality", () => {
    assert.deepStrictEqual({ x: 1 }, { x: 2 }, "Objects are not deeply equal");
  });

  it("5: should fail on null check", () => {
    assert.strictEqual(null, undefined, "Null is not undefined");
  });

  it("6: should fail on regex match failure", () => {
    assert.match("hello world", /goodbye/, "String does not match regex /goodbye/");
  });

  it("7: should fail on custom assertion failure", () => {
    assert.fail("Deliberate custom failure assertion");
  });

  it("8: should fail on array length mismatch", () => {
    assert.strictEqual([1, 2, 3].length, 5, "Array length is not 5");
  });

  it("9: should fail on boolean inversion check", () => {
    assert.strictEqual(!true, true, "Negated true is not true");
  });

  it("10: should fail on empty string validation", () => {
    assert.ok("".length > 0, "String must not be empty");
  });

  it("11: should fail on promise rejection failure", async () => {
    await Promise.reject(new Error("Async rejection in test 11"));
  });

  it("12: should fail on type check failure", () => {
    assert.strictEqual(typeof 42, "string", "Type of 42 is not string");
  });

  it("13: should fail on floating point arithmetic check", () => {
    assert.strictEqual(0.1 + 0.2, 0.3, "0.1 + 0.2 is not exactly 0.3 due to float precision");
  });

  it("14: should fail on array inclusion check", () => {
    assert.ok([1, 2, 3].includes(4), "Array [1, 2, 3] does not contain 4");
  });

  it("15: should fail on map lookup failure", () => {
    const map = new Map();
    assert.ok(map.has("key"), "Map does not have key");
  });

  it("16: should fail on set size check", () => {
    const set = new Set([1, 2]);
    assert.strictEqual(set.size, 3, "Set size is not 3");
  });

  it("17: should fail on dynamic bounds validation", () => {
    const value = 15;
    assert.ok(value < 10, "Value is not less than 10");
  });

  it("18: should fail on undefined property access check", () => {
    const obj = {};
    assert.ok(obj.nonexistent.property, "Cannot read property of undefined");
  });

  it("19: should fail on string similarity check", () => {
    assert.strictEqual("Antigravity", "antigravity", "Case mismatch should fail");
  });

  it("20: should fail on date comparison", () => {
    const date1 = new Date("2026-05-30");
    const date2 = new Date("2026-05-31");
    assert.strictEqual(date1.getTime(), date2.getTime(), "Dates are not equal");
  });

  it("21: should fail on json parsing invalid string", () => {
    JSON.parse("{invalid-json}");
  });

  it("22: should fail on circular reference serialization check", () => {
    const obj = {};
    obj.self = obj;
    assert.ok(JSON.stringify(obj), "Serialization of circular reference should fail");
  });

  it("23: should fail on math maximum check", () => {
    assert.strictEqual(Math.max(1, 5, 2), 2, "Max is not 2");
  });

  it("24: should fail on check for not-a-number", () => {
    assert.ok(Number.isNaN(42), "42 is not NaN");
  });

  it("25: should fail on division by zero validation", () => {
    assert.ok(!isFinite(5 / 0), "Should verify handling of division by zero, but this assertion is forced to fail");
    assert.fail("Force failure in division by zero test");
  });

  it("26: should fail on URL parsing invalid string", () => {
    new URL("invalid-url-format");
  });

  it("27: should fail on BigInt division mismatch", () => {
    assert.strictEqual(5n / 2n, 3n, "BigInt division truncated 5/2 to 2n, not 3n");
  });

  it("28: should fail on negative index array access", () => {
    const arr = [1, 2, 3];
    assert.strictEqual(arr[-1], 3, "Array[-1] is undefined in standard JS, not 3");
  });

  it("29: should fail on object keys length", () => {
    const obj = { a: 1, b: 2 };
    assert.strictEqual(Object.keys(obj).length, 3, "Object does not have 3 keys");
  });

  it("30: should fail on symbol comparison", () => {
    assert.strictEqual(Symbol("test"), Symbol("test"), "Symbols are always unique");
  });

  it("31: should fail on function identity check", () => {
    const f1 = () => {};
    const f2 = () => {};
    assert.strictEqual(f1, f2, "Functions have different identities");
  });

  it("32: should fail on class instance check", () => {
    class A {}
    class B {}
    assert.ok(new A() instanceof B, "Instance of A is not instance of B");
  });

  it("33: should fail on async delay assertion", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.fail("Delayed failure after timeout");
  });

  it("34: should fail on deep nested property validation", () => {
    const nested = { a: { b: { c: 42 } } };
    assert.strictEqual(nested.a.b.c, 43, "Nested property c is not 43");
  });

  it("35: should fail on promise resolving to incorrect value", async () => {
    const p = Promise.resolve("success");
    await p.then((val) => {
      assert.strictEqual(val, "failure", "Promise resolved to success, not failure");
    });
  });

  it("36: should fail on absolute value assertion", () => {
    assert.strictEqual(Math.abs(-5), -5, "Absolute value of -5 is not -5");
  });

  it("37: should fail on custom error class match", () => {
    class CustomError extends Error {}
    throw new CustomError("Expected a different error type");
  });

  it("38: should fail on generator function completion", () => {
    function* gen() {
      yield 1;
    }
    const g = gen();
    g.next();
    assert.strictEqual(g.next().done, false, "Generator is already done");
  });

  it("39: should fail on frozen object mutation check", () => {
    const obj = Object.freeze({ x: 1 });
    try {
      obj.x = 2; // will fail silently or throw in strict mode, let's assert to fail
      assert.strictEqual(obj.x, 2, "Frozen object property was not mutated");
    } catch (e) {
      throw new Error("Failed to mutate frozen object: " + e.message);
    }
  });

  it("40: should fail on string trimming validation", () => {
    assert.strictEqual("  hello  ".trim(), "  hello  ", "String was trimmed");
  });

  it("41: should fail on array reverse mutation check", () => {
    const arr = [1, 2, 3];
    assert.deepStrictEqual(arr.reverse(), [1, 2, 3], "Array reverse mutates in place");
  });

  it("42: should fail on typed array bounds", () => {
    const typed = new Uint8Array(2);
    typed[2] = 256;
    assert.strictEqual(typed[2], 256, "Out of bounds index has no effect");
  });

  it("43: should fail on weakmap reference garbage collection check", () => {
    const wm = new WeakMap();
    let obj = {};
    wm.set(obj, "data");
    assert.ok(!wm.has(obj), "Weakmap has reference");
  });

  it("44: should fail on error stack trace presence", () => {
    const err = new Error("No stack");
    err.stack = undefined;
    assert.ok(err.stack, "Error stack should be defined");
  });

  it("45: should fail on truthy conversion of empty object", () => {
    assert.strictEqual(Boolean({}), false, "Empty object is truthy, not falsy");
  });

  it("46: should fail on string replacement check", () => {
    assert.strictEqual("abc".replace("b", "d"), "abc", "String replacement did happen");
  });

  it("47: should fail on checking constructor properties", () => {
    assert.strictEqual((42).constructor, String, "Constructor of number is Number, not String");
  });

  it("48: should fail on array splicing assertion", () => {
    const arr = [1, 2, 3];
    arr.splice(1, 1);
    assert.deepStrictEqual(arr, [1, 2, 3], "Spliced array should have changed");
  });

  it("49: should fail on exponentiation calculation", () => {
    assert.strictEqual(2 ** 3, 9, "2 to the power of 3 is 8, not 9");
  });

  it("50: should fail on last check of the failing test suite", () => {
    assert.fail("Failure 50: The final deliberate fail in the suite");
  });
});
