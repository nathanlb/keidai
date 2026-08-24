import { Button } from "@keidai/ui";
import { Bot, Plus } from "lucide-react";
import { Link } from "react-router";
import { AGENTS_PATH } from "../../shell/navigation.js";
import { TASKS_NEW_HREF } from "../../runs/navigation.js";

export function HomeHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[23px] font-bold leading-[1.2] tracking-[-0.025em]">
          Home
        </h1>
        <p className="mt-[3px] text-[13.5px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="default" className="h-9 text-[13px]" asChild>
          <Link to={`${AGENTS_PATH}/new`}>
            <Bot aria-hidden />
            New agent
          </Link>
        </Button>
        <Button size="default" className="h-9 text-[13px] font-semibold" asChild>
          <Link to={TASKS_NEW_HREF}>
            <Plus aria-hidden />
            New task
          </Link>
        </Button>
      </div>
    </div>
  );
}
