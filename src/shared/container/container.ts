import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types";
import { bindDependencies } from "./bindings";

const container = new Container({
  defaultScope: "Singleton",
  skipBaseClassChecks: true,
});

// Bind all dependencies
bindDependencies(container);

export { container, TYPES };
export default container;
