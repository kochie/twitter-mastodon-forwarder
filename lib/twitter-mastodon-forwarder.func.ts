import { Context, EventBridgeEvent } from "aws-lambda";
import fetch, { FormData } from "node-fetch";
import { URL } from "url";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

import type { searchStream, TwitterResponse } from "twitter-api-sdk/dist/types";

const client = new SSMClient({});
const dynamodb = new DynamoDBClient({});

async function getMastodonUsername(twitterId: string): Promise<string> {
  const response = await dynamodb.send(
    new GetItemCommand({
      TableName: process.env.TABLE_NAME ?? "",
      Key: marshall(twitterId),
    })
  );

  if (!response.Item) {
    console.error(`no mastodon username for twitter id ${twitterId}`);
    return "";
  }

  return unmarshall(response.Item).mastodonUsername;
}

export async function handler(
  event: EventBridgeEvent<string, TwitterResponse<searchStream>["data"]>,
  context: Context
): Promise<void> {
  const mastodonAccessToken = await client.send(
    new GetParameterCommand({
      Name: process.env.MASTODON_ACCESS_TOKEN_SSM_NAME ?? "",
      WithDecryption: true,
    })
  );

  if (event["detail-type"] !== "tweet") {
    console.error("not a tweet event", event);
    return;
  }

  if (event.detail?.entities?.mentions) {
    const mentions = event.detail.entities.mentions;
    const mastodonMentions = await Promise.all(
      mentions.map(async (mention) => {
        const mastodonUsername = await getMastodonUsername(mention.username);
        return { ...mention, mastodonUsername };
      })
    );

    let text = event.detail?.text;
    mastodonMentions.reverse().forEach((mention) => {
      if (!mention.mastodonUsername) return;
      text =
        text.substring(0, mention.start) +
        `@${mention.mastodonUsername}` +
        text.substring(mention.end);
    });

    event.detail.text = text;
  }

  const url = new URL(`https://${process.env.MASTODON_DOMAIN}/api/v1/statuses`);
  url.searchParams.append(
    "access_token",
    mastodonAccessToken.Parameter?.Value ?? ""
  );

  const formData = new FormData();
  formData.set("status", event.detail?.text ?? "");

  await fetch(url.toString(), {
    method: "POST",
    body: formData,
  });
}
