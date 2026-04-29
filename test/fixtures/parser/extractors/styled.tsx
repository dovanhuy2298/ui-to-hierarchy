import styled from "styled-components";
const Box = styled.div`
  color: red;
  padding: ${(p) => p.theme.space};
  font-size: 12px;
`;
const FancyBox = styled(Box)`
  background: blue;
`;
export function S() {
  return (
    <Box>
      <FancyBox />
    </Box>
  );
}
