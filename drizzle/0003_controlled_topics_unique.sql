CREATE UNIQUE INDEX "user_topics_user_id_topic_id_unique" ON "user_topics" USING btree ("user_id","topic_id");
