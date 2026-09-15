import { supervisorProcedure, router } from "../index";
import { importSheet } from "../lib/import-sheet";

export const adminRouter = router({
	importSheet: supervisorProcedure.mutation(async ({ ctx }) => {
		return await importSheet(ctx.db);
	}),
});
