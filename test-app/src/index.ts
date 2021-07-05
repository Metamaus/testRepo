import { Probot } from "probot"
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app"

const bodyParser = require("body-parser")

const createCheck = async (myOctokit: any, owner: string, repo: string, head_sha: string) => 
{
  const output =
  {
    title: "Sending request to the api...",
    summary: "",
    //text: "### Text \nThis is where we give **lots of** details."
  }

  const check =
  {
    name: "Breakbot report",
    head_sha: head_sha,
    status: "queued",
    //conclusion: "success",
    output: output
  }

  try
  {
    myOctokit.request("POST /repos/" + owner + "/" + repo + "/check-runs", check);
  }
  catch (err)
  {
    console.error(err)
  }
}

const progressCheck = async (myOctokit: any, owner: string, repo: string, check_id: number) =>
{
  console.log("The test: " + check_id + " will be in progress soon !")
  const newCheck =
  {
    status: "in_progress",
    output: {
      title: "Maracas is processing...",
      summary: ""
    }
  }
  try {
    myOctokit.request("PATCH /repos/" + owner + "/" + repo + "/check-runs/" + check_id, newCheck);
  }
  catch (err) {
    console.error(err)
  }
}

const updateCheck = async (myOctokit: any, owner: string, repo: string, check_id: number, myJson: any) =>
{
  // Add an action

  var myActions = [{
    label: "Rerun test",
    description: "",
    identifier: "rerun"
  }]

  // Add an annotation (hard-coded)
  var myAnnotations =
  [{
    path: "test-app/src/index.ts",
    start_line: 3,
    end_line: 6,
    annotation_level: "notice",
    message: "This is my first annotation \nAnd it's cool !",
    title: "First annotation"
  }]

  var newOutput =
  {
    title: "",
    summary: "",
    annotations: myAnnotations
  }

  //---Format the Json---
  // Generic declaration
  const nMax = 10
  const n = myJson.breakingChanges.length

  newOutput.title += "This PR introduces " + n + " breaking changes in the base branch." //+ "\nThe request was computed in " + time + " seconds";

  // Detail on the BC
  newOutput.summary += "Here is a list of the breaking changes caused."
  for (let i = 0; i < n; i++)
  {
    if (i < nMax)
    {
      newOutput.summary += "\n### The declaration [" + myJson.breakingChanges[i].declaration + "]"
      newOutput.summary += "(" + myJson.breakingChanges[i].url + ")"
      newOutput.summary += " is impacted by _" + myJson.breakingChanges[i].type + "_"

      const nd = myJson.breakingChanges[i].detections.length
      if (nd > 0)
      {
        newOutput.summary += "\nThis modification produces " + nd + " impacts on clients:"
        for (let j = 0; j < nd; j++)
          if (j < nMax)
          {
            newOutput.summary += "\n- Declaration [" + myJson.breakingChanges[i].detections[j].elem + "](" + myJson.breakingChanges[i].detections[j].url + ") in [this client](" + myJson.breakingChanges[i].detections[j].clientUrl + ")"
          }        
      }
    }


  }
  
  const newCheck =
  {
    status: "completed",
    conclusion: "neutral",
    output: newOutput,
    actions: myActions
  }

  //console.log(newCheck)

  try
  {
    myOctokit.request("PATCH /repos/" + owner + "/" + repo + "/check-runs/" + check_id, newCheck);
  }
  catch (err)
  {
    console.error(err)
  }
}

const getCheck = async (finished: boolean, owner: string, repo: string, installationId: number, branchName: string, myJson: any) =>
{
  console.log("getCheck starting")
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth:
    {
      appId: process.env.APP_ID,
      privateKey: process.env.PRIVATE_KEY,
      installationId: installationId
    },
  });

  var resTest = await appOctokit.request("/repos/" + owner + "/" + repo + "/commits/" + branchName + "/check-runs") // branch sha is the chosen ref, see tuto for cleaner declaration
  
  var n = resTest.data.total_count
  const checks = resTest.data.check_runs

  console.log("Response status: " + resTest.status + "\nurl of response: " + resTest.url + "\ntotal_count: " + n)

  for (let i = 0; i < n; i++)
  {
    if (checks[i].app.id == process.env.APP_ID)
    {
      console.log("The check " + checks[i].name + " with id " + checks[i].id + " is mine !")
      if (finished)
      {
        updateCheck(appOctokit, owner, repo, checks[i].id, myJson)
      }
      else
      {
        progressCheck(appOctokit, owner, repo, checks[i].id)
      }
      return checks[i].id
    }
  }

  return -1
}

const getConfig = async (context: any) => {
  // get config and print sth
  const config = await context.config('.breakbot.yml')

  if (config.close) {
    console.log("Config comment: " + config.comment)
  }
  else {
    console.log("No config comment")
  }
}

export = (app: Probot, option: any) =>
{

  const router = option.getRouter("/testapp");

  router.use(bodyParser.json())

  router.post("/pr/:owner/:repo/:branch", (req: any, res: any) => {
    getCheck(true, req.params.owner, req.params.repo, req.body.installationId, req.params.branch, req.body.delta)
    res.status(200)
    res.send("Received")
  })

  router.post("/update/:owner/:repo/:branch", (req: any, res: any) => {
    getCheck(false, req.params.owner, req.params.repo, req.body.installationId, req.params.branch, null)
    res.status(200)
    res.send("Received")
  })

  app.on("issues.opened", async (context: any) => {
    const issueComment = {
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: context.payload.issue.number,
      body: "Thanks for opening this issue !",
    };
    await context.octokit.issues.createComment(issueComment);
  });

  app.on("pull_request.assigned", async (context: any) => { //if there is only one action generated by this app, it's okay: https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#check_run
    getConfig(context)
    const owner = context.payload.pull_request.head.repo.owner.login
    const repo = context.payload.pull_request.head.repo.name
    const head_sha = context.payload.pull_request.head.sha

    await createCheck(context.octokit, owner, repo, head_sha)
  });

  app.on("check_run.requested_action", async (context: any) => {
    console.log("Test requested")
  })
};
