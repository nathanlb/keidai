import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { OwnerAvatar } from "../../../shell/components/owner-avatar/owner-avatar.js";

test("renders owner initials in the avatar", async () => {
  const screen = await render(<OwnerAvatar initials="DU" />);
  await expect.element(screen.getByText("DU")).toBeInTheDocument();
});
