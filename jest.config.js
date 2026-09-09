module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    // Without roots, jest sweeps in the vendored skill's example tests and scripts/spec.mjs.
    roots: ["<rootDir>/tests/nodes", "<rootDir>/tests/helpers"],
};
