import styles from "./Component.module.css";
import * as nsStyles from "./other.module.css";
export function CssMod() {
  return (
    <div className={styles.root}>
      <span className={styles.title}>x</span>
      <em className={nsStyles.italic}>y</em>
    </div>
  );
}
