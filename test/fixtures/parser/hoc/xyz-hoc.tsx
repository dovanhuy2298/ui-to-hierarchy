declare const xyzHOC: <T>(c: T) => T;
const Inner = () => <div>x</div>;
export const Foo = xyzHOC(Inner);
