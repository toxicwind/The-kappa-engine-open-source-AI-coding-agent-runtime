/**
 * fleet-join.ts — Kappa auto-join hook for Squawk Fleet bus (:25120).
 * Registers new kappa sessions with LDP Agent Card and maintains presence heartbeats.
 */

export interface KappaSessionMeta {
	id: string;
	slug: string;
	title: string;
	directory: string;
	model?: {
		id: string;
		providerID?: string;
	};
}

export function autoJoinSquawkFleet(info: KappaSessionMeta): void {
	void (async () => {
		try {
			const tokenFile = Bun.file(`${process.env.HOME}/.config/estate-chat-token`);
			if (!(await tokenFile.exists())) return;
			const token = (await tokenFile.text()).trim();

			const agentId = `kappa-${info.slug}`;
			const card = {
				"@context": ["https://www.w3.org/ns/activitystreams", "https://schema.org"],
				id: `urn:agent:${agentId}`,
				type: ["Agent", "SoftwareAgent"],
				name: agentId,
				species: "kappa",
				role: "coding-agent",
				task: info.title,
				lanes: ["fast", "reasoning", "code"],
				capabilities: ["code_generation", "tool_use", "mcp"],
				protocols: ["squawk/2.0", "a2a/1.0"],
				created: new Date().toISOString(),
			};

			// 1. Join squawk fleet
			await fetch("http://127.0.0.1:25120/v1/join", {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					agent_id: agentId,
					name: agentId,
					surface: "kappa-code",
					activity: `kappa session: ${info.title}`,
					counters: {
						species: "kappa",
						directory: info.directory,
						model: info.model?.id,
						card,
					},
				}),
			});

			// 2. Continuous presence heartbeat (every 30s)
			const timer = setInterval(async () => {
				try {
					await fetch("http://127.0.0.1:25120/v1/presence", {
						method: "POST",
						headers: {
							"Authorization": `Bearer ${token}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							agent_id: agentId,
							activity: "active",
						}),
					});
				} catch {}
			}, 30_000);

			if (typeof timer.unref === "function") {
				timer.unref();
			}
		} catch {
			// Fleet daemon unavailable; non-fatal
		}
	})();
}
