import { withRouter } from "next/router";
const Inner = () => <div>x</div>;
export const Foo = withRouter(Inner);
