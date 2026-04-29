import { Header } from "../../components/Header";
import { Card } from "../../components/Card";
import StyledThing from "../../components/StyledThing";

export default function ProfilePage() {
  return (
    <Header>
      <Card title="profile-card" />
      <StyledThing />
    </Header>
  );
}
