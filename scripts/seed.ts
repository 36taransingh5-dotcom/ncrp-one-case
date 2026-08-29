import { seedDemo } from "../lib/seed";
seedDemo(process.argv.includes("--reset"));
console.log("NCRP One Case demo data is ready.");
