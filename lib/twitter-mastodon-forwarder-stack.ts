import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { EventBus, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";

const MASTODON_ACCESS_TOKEN_SSM_NAME = "mastodon-access-token";

export class TwitterMastodonForwarderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const twitterMastodonTable = new Table(this, "dynamo-db-table", {
      tableName: "twitter-mastodon-users",
      partitionKey: {
        name: "twitterId",
        type: AttributeType.STRING,
      },
    });

    const mastodonAccessToken =
      StringParameter.fromSecureStringParameterAttributes(
        this,
        "TwitterConsumerSecret",
        {
          parameterName: MASTODON_ACCESS_TOKEN_SSM_NAME,
        }
      );

    const func = new NodejsFunction(this, "TwitterMastodonForwarderFunction", {
      entry: "lib/twitter-mastodon-forwarder.func.ts",
      handler: "handler",
      environment: {
        TABLE_NAME: twitterMastodonTable.tableName,
        MASTODON_DOMAIN: "melb.social",
        MASTODON_ACCESS_TOKEN_SSM_NAME: mastodonAccessToken.parameterName,
      },
    });

    twitterMastodonTable.grantReadData(func);
    mastodonAccessToken.grantRead(func);

    const rule = new Rule(this, "TweetRule", {
      eventBus: EventBus.fromEventBusName(
        this,
        "TwitterEventBus",
        "TweetEventBus"
      ),
      eventPattern: {
        detailType: ["tweet"],
        source: ["twitter"],
      },
    });

    rule.addTarget(new LambdaFunction(func, {}));
  }
}
