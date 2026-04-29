import { forwardRef } from "react";
export const Foo = forwardRef<HTMLDivElement>((props, ref) => <div ref={ref}>x</div>);
