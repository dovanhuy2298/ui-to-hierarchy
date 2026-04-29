import { cn } from "./cn";
const dynamicClass = "p-2";
export function Tw() {
  return (
    <div className="flex items-center md:flex-col [&>svg]:size-6 text-red-500 hover:text-blue-500">
      <span className={cn("p-4", "gap-2", { "rounded-md": true, [dynamicClass]: true }, dynamicClass)}>x</span>
    </div>
  );
}
