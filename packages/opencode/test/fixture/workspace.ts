import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Auth } from "../../src/auth/index.ts"
import { Workspace } from "../../src/control-plane/workspace.ts"
import { RuntimeFlags } from "../../src/effect/runtime-flags.ts"
import { InstanceBootstrap } from "../../src/project/bootstrap.ts"
import { InstanceStore } from "../../src/project/instance-store.ts"
import { Project } from "../../src/project/project.ts"
import { Vcs } from "../../src/project/vcs.ts"
import { Session } from "../../src/session/session.ts"
import { SessionPrompt } from "../../src/session/prompt.ts"
import { EventV2Bridge } from "../../src/event-v2-bridge.ts"

export const workspaceLayerWithRuntimeFlags = (overrides: Partial<RuntimeFlags.Info>) =>
  AppNodeBuilder.build(
    LayerNode.group([
      Workspace.node,
      Auth.node,
      Session.node,
      SessionPrompt.node,
      Project.node,
      Vcs.node,
      Database.node,
      EventV2Bridge.node,
      FSUtil.node,
      InstanceStore.node,
    ]),
    [
      [InstanceStore.bootstrapNode, InstanceBootstrap.node],
      [RuntimeFlags.node, RuntimeFlags.layer(overrides)],
    ],
  )
