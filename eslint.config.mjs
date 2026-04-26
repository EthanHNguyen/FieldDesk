import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [{ ignores: ["test-results/**"] }, ...nextVitals, ...nextTypescript];

export default eslintConfig;
