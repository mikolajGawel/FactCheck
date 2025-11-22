import test from "node:test";
import assert from "node:assert/strict";

import { escapeDangerousContent } from "../src/utils/sanitize.js";

test("escapeDangerousContent leaves null and undefined untouched", () => {
	assert.equal(escapeDangerousContent(null), null);
	assert.equal(escapeDangerousContent(undefined), undefined);
});

test("escapeDangerousContent escapes basic HTML meta characters", () => {
	const input = "<script>alert('x')</script>&\"";
	const output = escapeDangerousContent(input);

	assert.equal(output.indexOf("<") === -1, true);
	assert.equal(output.indexOf(">") === -1, true);
	assert.equal(output.indexOf("&") !== -1, true); // should be encoded as &amp; at least once
	assert.match(output, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;&amp;&quot;/);
});

test("escapeDangerousContent handles empty strings", () => {
	assert.equal(escapeDangerousContent(""), "");
});
