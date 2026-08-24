/**
 * Process-wide DataSourceRegistry singleton - Unit 1's registry is in-memory by design; Unit 2's
 * single-replica deployment (Infrastructure Design) makes one shared instance per process the
 * correct scope for it. Not a new architectural decision - just where the single Unit 1 instance
 * this app actually needs gets constructed once.
 */
import { DataSourceRegistry } from "../data-source-registry/index.js";

export const dataSourceRegistry = new DataSourceRegistry();
