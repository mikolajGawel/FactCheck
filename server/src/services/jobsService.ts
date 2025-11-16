type JobRecord = {
	status: string;
	result: any | null;
	error?: any;
	cached?: boolean;
	requestedAt: number;
	completedAt?: number | null;
};

const jobs: Record<string, Record<string, JobRecord>> = Object.create(null);

export function ensureJobBucket(ip) {
	if (!jobs[ip]) {
		jobs[ip] = Object.create(null);
	}
	return jobs[ip];
}

export function getJobBucket(ip) {
	return jobs[ip] ?? null;
}

export function getJob(ip, jobId) {
	return jobs[ip]?.[jobId] ?? null;
}

export function buildJobRecord(initial: Partial<JobRecord> & { status: string }) {
	return {
		status: initial.status,
		result: initial.result ?? null,
		error: initial.error,
		cached: initial.cached ?? false,
		requestedAt: Date.now(),
		completedAt: initial.completedAt ?? null
	} as JobRecord;
}
