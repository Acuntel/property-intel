import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAddress, sqlEscape } from "../src/address.js";
import { addressFromUrl } from "../src/pull.js";
import { stripJsonPrefix } from "../src/http.js";

test("parseAddress: full comma-separated address", () => {
  const a = parseAddress("620 Rodenburg Rd, Roselle, IL 60172");
  assert.equal(a.number, "620");
  assert.equal(a.street, "620 RODENBURG RD");
  assert.equal(a.streetBase, "RODENBURG");
  assert.equal(a.city, "ROSELLE");
  assert.equal(a.state, "IL");
  assert.equal(a.zip, "60172");
});

test("parseAddress: Census comma-before-zip format", () => {
  const a = parseAddress("620 RODENBURG RD, ROSELLE, IL, 60172");
  assert.equal(a.number, "620");
  assert.equal(a.city, "ROSELLE");
  assert.equal(a.state, "IL");
  assert.equal(a.zip, "60172");
});

test("parseAddress: directional prefix and suffix stripped for streetBase", () => {
  const a = parseAddress("123 N Main Street, Wheaton, IL 60187");
  assert.equal(a.number, "123");
  assert.equal(a.streetBase, "MAIN");
});

test("parseAddress: multi-word street name keeps all name tokens", () => {
  const a = parseAddress("45 Lake Shore Dr, Chicago, IL 60611");
  assert.equal(a.streetBase, "LAKE SHORE");
});

test("sqlEscape doubles single quotes", () => {
  assert.equal(sqlEscape("O'Hare"), "O''Hare");
});

test("addressFromUrl: redfin listing path", () => {
  const a = addressFromUrl(
    "https://www.redfin.com/IL/Roselle/620-Rodenburg-Rd-60172/home/12345678",
  );
  assert.equal(a, "620 Rodenburg Rd, Roselle, IL 60172");
});

test("addressFromUrl: zillow homedetails path", () => {
  const a = addressFromUrl(
    "https://www.zillow.com/homedetails/620-Rodenburg-Rd-Roselle-IL-60172/12345_zpid/",
  );
  assert.ok(a && a.includes("620 Rodenburg Rd Roselle IL"));
});

test("addressFromUrl: non-url returns null", () => {
  assert.equal(addressFromUrl("620 Rodenburg Rd"), null);
});

test("stripJsonPrefix removes redfin anti-hijack token", () => {
  assert.equal(stripJsonPrefix('{}&&{"a":1}'), '{"a":1}');
  assert.equal(stripJsonPrefix("  \n[1,2]"), "[1,2]");
  assert.equal(stripJsonPrefix('{"clean":true}'), '{"clean":true}');
});
