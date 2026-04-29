import styled from "styled-components";
import { cn } from "clsx";
import styles from "./KS.module.css";

const Wrapper = styled.section`
  border: 1px solid ${(p) => p.color};
`;

export function KS() {
  return (
    <Wrapper className={cn("flex p-4 text-red-500", "gap-2")} style={{ margin: 8 }}>
      <span className={styles.label}>x</span>
    </Wrapper>
  );
}
