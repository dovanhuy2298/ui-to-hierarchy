// Fixture for POLISH-03 declLines population.
// Line numbers below are load-bearing — referenced by parser test assertions.
import { type ReactNode } from "react";

export function Foo() {
  return <span>foo</span>;
}

export const Bar = () => {
  return <span>bar</span>;
};

export class Baz {
  render(): ReactNode {
    return null;
  }
}

export { Renamed as Outer } from "./renamed-source.js";

export default () => null;
