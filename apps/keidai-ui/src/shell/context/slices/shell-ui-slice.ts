export interface ShellUiState {
  navOpen: boolean;
}

export type ShellUiAction =
  | { type: "shell-ui/setNavOpen"; navOpen: boolean }
  | { type: "shell-ui/toggleNav" };

export const initialShellUiState: ShellUiState = {
  navOpen: false,
};

export function shellUiReducer(
  state: ShellUiState,
  action: ShellUiAction,
): ShellUiState {
  switch (action.type) {
    case "shell-ui/setNavOpen":
      return { navOpen: action.navOpen };
    case "shell-ui/toggleNav":
      return { navOpen: !state.navOpen };
    default:
      return state;
  }
}
