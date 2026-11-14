#!/usr/bin/env -S just --justfile

set unstable

set allow-duplicate-recipes

[doc('CHOOSE ONE ANY YET THE TIME')]
default:
    @just --choose

alias build := docker-build
alias up-entire := docker-compose-build
alias status-ps := docker-compose-status
alias status := docker-status
alias setup := justfile-require-setup
alias up :=  docker-compose-up
alias c := clear 


[group("DOCKER__&&__DOCKER-COMPOSE")]
[group("Artifact")]
docker-build:
    @echo "ATTENTION :>> FRONTEND BACKEND BOTH IMAGE CREATION START..."
    @echo "FRONTEND BUILD....."
    docker build -t frontend ./apps/web/.
    @echo "FRONTEND IMAGE DONE ........................................................"
    @echo "BACKEND BUILD......"
    docker build -t backend ./apps/api/.
    @echo "BACKEND IMAGE DONE ........................................................"

[group("DOCKER__&&__DOCKER-COMPOSE")]
[group("Docker-compose up with build ")]
docker-compose-build:
    @echo "ATTENTION :>> FRONTEND BACKEND DATABASE CACHE-DB DB-UI UP ON JUST DOCKER-COMPOSE USE IT FOR UP  AND BUILD ALL THING S"
    @echo "............................................................................"
    @echo "DOCKER COMPOSE UP WITH BUILD"
    @echo "..........ON DETACH MODE BUILD....."
    docker compose up -d --build
    @echo ".....................................ATTENTION HERE..............................................................."
    @echo "NOTE:>> use >> docker compose down -v << for down entire service yet the time ........."

[group("DOCKER__&&__DOCKER-COMPOSE")]
[group("Docker-compose up only ")]
docker-compose-up:
    @echo "ATTENTION :>> FRONTEND BACKEND DATABASE CACHE-DB DB-UI UP ON JUST DOCKER-COMPOSE USE IT FOR UP ALL THING S"
    @echo "............................................................................"
    @echo "DOCKER COMPOSE UP ONLY" 
    @echo "..........ON DETACH MODE UP....."
    docker compose up -d 
    @echo ".....................................ATTENTION HERE..............................................................."
    @echo "NOTE:>> use >> docker compose down -v << for down entire service yet the time ........."


[group("DOCKER__&&__DOCKER-COMPOSE")]
[group("Docker-compose -- status check")]
docker-compose-status:
    @echo "ATTENTION :>> DOCKER-COMPOSE STATUS <<..."
    @echo "............................................................................"
    docker compose ps
    @echo ".....................................COMPLETED............................................................"


[group("DOCKER__&&__DOCKER-COMPOSE")]
[group("Docker-- status check")]
docker-status:
    @echo "ATTENTION :>> DOCKER STATUS <<..."
    @echo "............................................................................"
    docker ps
    @echo ".....................................COMPLETED............................................................"






[script]
[group(" JUSTFILE SET-UP ")]
[doc("if you doesn't have version of justfile latest or 1.40.0 please first update it ")]
justfile-require-setup:
    echo "ATTENTION :>> JUSTFILE SET-UP <<..."
    ./Justfile_Customization_Choose.sh
    echo "ATTENTION :>> JUSTFILE SET-UP DONE>>>>>>>>>..."


[group("CLEAR-TERMINAL")]
[doc("CLEAR TERMINAL ALL OUTPUT'S")]
clear: 
    clear

