import { db } from './db/client.js';
import { projects } from './db/schema.js';
import { eq, or } from 'drizzle-orm';
import { runEMAgent } from './orchestrator/emAgent.js';

// Recovery runs sequentially to prevent race conditions
let recoveryInProgress = false;

export async function recoverInProgressProjects(): Promise<void> {
  if (recoveryInProgress) {
    console.log('Recovery already in progress, skipping');
    return;
  }

  recoveryInProgress = true;

  try {
    // Find projects that were in progress when server stopped
    const inProgressProjects = await db.select()
      .from(projects)
      .where(or(
        eq(projects.status, 'running'),
        eq(projects.status, 'waiting_approval')
      ));

    console.log(`Found ${inProgressProjects.length} projects to recover`);

    // Recover sequentially to avoid race conditions
    for (const project of inProgressProjects) {
      console.log(`Recovering project ${project.id} (status: ${project.status})`);

      // For waiting_approval, just leave it - will resume when gate is resolved
      if (project.status === 'waiting_approval') {
        console.log(`Project ${project.id} waiting for approval, skipping`);
        continue;
      }

      // For running, resume the EM agent and wait for it to initialize
      try {
        await runEMAgent({
          projectId: project.id,
          cwd: project.cwd || process.cwd(),
          request: '', // Empty request for recovery - EM will continue from session
        });
        console.log(`Recovered project ${project.id}`);
      } catch (err) {
        console.error(`Failed to recover project ${project.id}:`, err);
      }
    }
  } finally {
    recoveryInProgress = false;
  }
}
