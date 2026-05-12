// Fixture for POLISH-03 / WR-02 — declLines coverage for the dominant
// real-world wrapped-component shapes (forwardRef, memo, styled).
// Line numbers below are load-bearing — referenced by parseFile test
// assertions to guard against regressing to the `line: 1` fallback.
import { forwardRef, memo } from "react";

// biome-ignore lint: minimal styled stub for fixture purposes (no runtime).
const styled: { div: (s: TemplateStringsArray) => unknown } = {
  div: () => null,
};

export const Button = forwardRef<HTMLButtonElement, { label: string }>(
  (props, ref) => <button ref={ref}>{props.label}</button>,
);

export const Card = memo(function Card(props: { children: unknown }) {
  return <div>{props.children as never}</div>;
});

export const Box = styled.div`
  display: flex;
`;
