import { requestUrl, RequestUrlParam } from "obsidian";

export interface BrainObject {
	id: string;
	type: string;
	name: string;
	status: string;
	created: string;
	modified: string;
	path: string;
	description: string;
	timeline: string;
	rules: string;
	source_session: string;
}

export interface BrainConnection {
	relation: string;
	name: string;
	type: string;
	status: string;
	id: string;
	direction: "outgoing" | "incoming";
}

export interface TypeCount {
	type: string;
	count: number;
}

interface CypherResponse {
	columns: string[];
	rows: any[][];
	error?: string;
}

export class BrainClient {
	private endpoint: string;
	private apiKey: string;

	constructor(endpoint: string, apiKey: string) {
		this.endpoint = endpoint.replace(/\/+$/, "");
		this.apiKey = apiKey;
	}

	updateConfig(endpoint: string, apiKey: string) {
		this.endpoint = endpoint.replace(/\/+$/, "");
		this.apiKey = apiKey;
	}

	private async cypher(query: string, params: Record<string, any> = {}): Promise<CypherResponse> {
		const req: RequestUrlParam = {
			url: `${this.endpoint}/cypher`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": this.apiKey,
			},
			body: JSON.stringify({ query, params }),
		};
		const res = await requestUrl(req);
		if (res.json.error) {
			throw new Error(res.json.error);
		}
		return res.json;
	}

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		try {
			const req: RequestUrlParam = {
				url: `${this.endpoint}/health`,
				method: "GET",
			};
			const res = await requestUrl(req);
			if (res.json.status === "ok") {
				const tables = res.json.node_tables?.length || 0;
				return { ok: true, message: `Connected — ${tables} node tables` };
			}
			return { ok: false, message: "Unexpected response" };
		} catch (e: any) {
			return { ok: false, message: e.message || "Connection failed" };
		}
	}

	async getObjectCounts(): Promise<TypeCount[]> {
		const res = await this.cypher(
			"MATCH (o:Object) RETURN o.type AS type, COUNT(*) AS cnt ORDER BY cnt DESC"
		);
		return res.rows.map((r) => ({ type: r[0], count: r[1] }));
	}

	async listObjects(
		type?: string,
		status?: string,
		limit: number = 100
	): Promise<BrainObject[]> {
		const conditions: string[] = [];
		const params: Record<string, any> = {};

		if (type) {
			conditions.push("o.type = $type");
			params.type = type;
		}
		if (status) {
			conditions.push("o.status = $status");
			params.status = status;
		}

		const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const res = await this.cypher(
			`MATCH (o:Object) ${where} RETURN o ORDER BY o.modified DESC LIMIT ${limit}`,
			params
		);
		return res.rows.map((r) => this.parseObject(r[0]));
	}

	async getObject(nameOrId: string): Promise<BrainObject | null> {
		const res = await this.cypher(
			"MATCH (o:Object) WHERE o.id = $key OR LOWER(o.name) = LOWER($key) RETURN o",
			{ key: nameOrId }
		);
		if (res.rows.length === 0) return null;
		return this.parseObject(res.rows[0][0]);
	}

	async getConnections(nameOrId: string): Promise<BrainConnection[]> {
		const connections: BrainConnection[] = [];

		// Outgoing
		const out = await this.cypher(
			`MATCH (a:Object)-[c:Connection]->(b:Object)
			 WHERE a.id = $key OR LOWER(a.name) = LOWER($key)
			 RETURN c.relation, b.name, b.type, b.status, b.id`,
			{ key: nameOrId }
		);
		for (const r of out.rows) {
			connections.push({
				relation: r[0],
				name: r[1],
				type: r[2],
				status: r[3],
				id: r[4],
				direction: "outgoing",
			});
		}

		// Incoming
		const inc = await this.cypher(
			`MATCH (a:Object)-[c:Connection]->(b:Object)
			 WHERE b.id = $key OR LOWER(b.name) = LOWER($key)
			 RETURN c.relation, a.name, a.type, a.status, a.id`,
			{ key: nameOrId }
		);
		for (const r of inc.rows) {
			connections.push({
				relation: r[0],
				name: r[1],
				type: r[2],
				status: r[3],
				id: r[4],
				direction: "incoming",
			});
		}

		return connections;
	}

	async searchObjects(query: string, limit: number = 50): Promise<BrainObject[]> {
		const res = await this.cypher(
			`MATCH (o:Object)
			 WHERE LOWER(o.name) CONTAINS LOWER($q) OR LOWER(o.description) CONTAINS LOWER($q)
			 RETURN o ORDER BY o.modified DESC LIMIT ${limit}`,
			{ q: query }
		);
		return res.rows.map((r) => this.parseObject(r[0]));
	}

	async updateStatus(objectId: string, newStatus: string): Promise<boolean> {
		const escaped = this.escapeStr(newStatus);
		const res = await this.cypher(
			`MATCH (o:Object) WHERE o.id = $id SET o.status = ${escaped} RETURN o.name`,
			{ id: objectId }
		);
		return res.rows.length > 0;
	}

	async updateDescription(objectId: string, description: string): Promise<boolean> {
		const escaped = this.escapeStr(description);
		const res = await this.cypher(
			`MATCH (o:Object) WHERE o.id = $id SET o.description = ${escaped} RETURN o.name`,
			{ id: objectId }
		);
		return res.rows.length > 0;
	}

	async deleteObject(objectId: string): Promise<boolean> {
		// Delete outgoing connections
		await this.cypher(
			`MATCH (a:Object)-[c:Connection]->(b:Object) WHERE a.id = $id DELETE c`,
			{ id: objectId }
		);
		// Delete incoming connections
		await this.cypher(
			`MATCH (a:Object)-[c:Connection]->(b:Object) WHERE b.id = $id DELETE c`,
			{ id: objectId }
		);
		// Delete the object
		await this.cypher(
			`MATCH (o:Object) WHERE o.id = $id DELETE o`,
			{ id: objectId }
		);
		return true;
	}

	async deleteConnection(fromId: string, relation: string, toId: string): Promise<boolean> {
		const escaped = this.escapeStr(relation);
		await this.cypher(
			`MATCH (a:Object)-[c:Connection]->(b:Object)
			 WHERE a.id = $fromId AND b.id = $toId AND c.relation = ${escaped}
			 DELETE c`,
			{ fromId, toId }
		);
		return true;
	}

	private escapeStr(value: string): string {
		const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
		return `"${escaped}"`;
	}

	private parseObject(raw: any): BrainObject {
		return {
			id: raw.id || "",
			type: raw.type || "",
			name: raw.name || "",
			status: raw.status || "",
			created: raw.created || "",
			modified: raw.modified || "",
			path: raw.path || "",
			description: raw.description || "",
			timeline: raw.timeline || "[]",
			rules: raw.rules || "",
			source_session: raw.source_session || "",
		};
	}
}
