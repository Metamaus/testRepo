import { Probot } from "probot"

export = (app: Probot, option: any) => {



  app.on("issues.opened", async (context: any) => {
    var test = "issue";
    const issueComment = {
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: context.payload.issue.number,
      body: "Thanks for opening this " + test + "!",
    };
    await context.octokit.issues.createComment(issueComment);
  });

  app.on("pull_request.assigned", async (context: any) => {
    const owner = context.payload.pull_request.head.repo.owner.login
    const repo = context.payload.pull_request.head.repo.name

    const output = {
      title: "This is the title",
      summary: "## Summary \nThis where we give **few** details",
      text: "### Text \nThis is where we give **lots of** details."
    }

    const check = {
      owner: owner,
      repo: repo,
      name: "test-check",
      head_sha: context.payload.pull_request.head.sha,
      status: "completed",
      conclusion: "success",
      output: output
    }

    app.log.info(check)
    try {
      context.octokit.request("POST /repos/" + owner + "/" + repo + "/check-runs", check);
    }
    catch (err) {
      app.log.error(err)
    }
  });
};
