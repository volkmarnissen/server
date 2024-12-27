docker run \
	--rm \
	--privileged \
	-v ~/.docker:/root/.docker \
	-v /var/run/docker.sock:/var/run/docker.sock:ro \
	-v /my_addon:/~/m2m/server \
    ghcr.io/home-assistant/amd64-builder:latest \
		--all \
		-t /data