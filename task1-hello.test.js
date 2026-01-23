// Test to verify task1-hello.txt was created correctly
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const testFilePath = resolve(process.cwd(), "task1-hello.txt");

// Test 1: File exists
if (!existsSync(testFilePath)) {
	console.error("❌ Test failed: task1-hello.txt does not exist");
	process.exit(1);
}
console.log("✓ Test passed: task1-hello.txt exists");

// Test 2: File has correct content
const content = readFileSync(testFilePath, "utf-8").trim();
const expectedContent = "Hello World";

if (content !== expectedContent) {
	console.error("❌ Test failed: Content mismatch");
	console.error(`  Expected: "${expectedContent}"`);
	console.error(`  Got: "${content}"`);
	process.exit(1);
}
console.log("✓ Test passed: Content is correct");

console.log("\n✅ All tests passed!");
